import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer } from 'vite-plus';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { allBlocks, markdownFiles } from '../tools/docs.ts';
import { serve } from './serve.ts';

// The site is built, and then used in a real browser: every page is opened, every example is run in its frame, one is edited, the search
// is used and the theme is switched. The site is served from under a path of its own, because it has to work wherever it is put.
//
//   pnpm vp test run site/   (PIPIS_CHROMIUM=<path> for a Chromium other than Playwright's)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out', 'site-test');
const PREFIX = '/some/where/';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

let pages: string[];
let examples: string[];
let browser: Browser | undefined;
let base = '';
let close: (() => void) | undefined;

beforeAll(async () => {
  // The site is built as it is built for real: by `vp build`, which runs the demos through Vite and writes the pages beside them.
  execSync(`pnpm vp build --outDir ${JSON.stringify(out)} --emptyOutDir`, { cwd: root, stdio: 'pipe' });
  const files = walk(out).map((f) => relative(out, f).replace(/\\/g, '/'));
  pages = files.filter((f) => f.endsWith('.html') && !/^(assets|pagefind|demo-assets)\//.test(f) && f !== 'demo-app.html');
  examples = files.filter((f) => f.startsWith('assets/examples/')).map((f) => f.slice('assets/examples/'.length, -'.js'.length));
  const { server, url } = await serve(out, 0, PREFIX);
  base = url;
  close = () => server.close();
  browser = await chromium.launch(process.env.PIPIS_CHROMIUM ? { executablePath: process.env.PIPIS_CHROMIUM } : {});
}, 180_000);

afterAll(async () => {
  await browser?.close();
  close?.();
});

describe('the built site', () => {
  it('has a page for every Markdown file, and a module for every live example', () => {
    const docs = join(root, 'docs');
    const expected = markdownFiles(docs).map((f) =>
      relative(docs, f)
        .replace(/\\/g, '/')
        .replace(/README\.md$/, 'index.md')
        .replace(/\.md$/, '.html'),
    );
    expect(pages.slice().sort()).toEqual(expected.sort());
    const live = allBlocks(root).filter((b) => b.kind === 'live');
    expect(examples.length).toBe(live.length);
    for (const b of live) expect(existsSync(join(out, 'assets/examples', `${b.id}.js`)), b.id).toBe(true);
  });

  it('links only by relative paths, so that it works under any path of any host', () => {
    for (const page of pages) {
      const html = readFileSync(join(out, page), 'utf8');
      for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        const target = m[1] ?? '';
        expect(target.startsWith('/'), `${page}: '${target}' is an absolute path`).toBe(false);
      }
    }
  });

  it('has links that go to a page and a heading that exist, and no page that nothing links to', () => {
    const ids = new Map<string, Set<string>>();
    const links = new Map<string, string[]>();
    for (const page of pages) {
      const html = readFileSync(join(out, page), 'utf8');
      ids.set(page, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? '')));
      links.set(
        page,
        [...html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)].map((m) => m[1] ?? '').filter((h) => !/^[a-z][a-z0-9+.-]*:/i.test(h)),
      );
    }
    const problems: string[] = [];
    const reached = new Set<string>(['index.html']);
    const queue = ['index.html'];
    while (queue.length) {
      const page = queue.pop() ?? '';
      for (const href of links.get(page) ?? []) {
        const [path = '', anchor] = href.split('#');
        const target = path === '' ? page : posix.join(posix.dirname(page), path);
        if (!ids.has(target)) {
          problems.push(`${page}: '${href}' is not a page`);
          continue;
        }
        if (anchor && !ids.get(target)?.has(anchor)) problems.push(`${page}: '${href}' has no heading '${anchor}'`);
        if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    for (const page of pages) if (!reached.has(page)) problems.push(`${page}: no page links to it`);
    expect(problems).toEqual([]);
  });

  it('puts the site files and the search index in the output, and no file of the pagefind demo UI', () => {
    const files = walk(out).map((f) => relative(out, f).replace(/\\/g, '/'));
    expect(files).toContain('assets/frame.html');
    expect(files).toContain('assets/lib/index.js');
    expect(files).toContain('pagefind/pagefind.js');
    expect(files).toContain('demo-app.html');
    expect(files.filter((f) => /pagefind-.*ui|pagefind-highlight/.test(f))).toEqual([]);
    expect(
      files.some((f) => /^assets\/edit-.*\.js$/.test(f)),
      'the editor is a chunk of its own',
    ).toBe(true);
  });
});

/** A page, opened in a fresh tab with its errors collected. */
async function open(path: string): Promise<{ page: Page; errors: string[] }> {
  const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(base + path);
  return { page, errors };
}

/** Every iframe of the page loaded now, and the example in each shown. */
async function showExamples(page: Page) {
  await page.evaluate(() => document.querySelectorAll('iframe').forEach((f) => f.setAttribute('loading', 'eager')));
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || !frame.url().includes('frame.html')) continue;
    await frame.waitForFunction(() => (document.getElementById('root')?.childNodes.length ?? 0) > 0, undefined, { timeout: 15_000 });
  }
}

describe('the dev server', () => {
  it('serves the generated pages with the reload client, and the demo app as Vite serves any entry', async () => {
    const dev = await createServer({ root, logLevel: 'silent', server: { port: 0, host: '127.0.0.1' } });
    await dev.listen();
    try {
      const address = dev.httpServer?.address();
      const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
      const get = async (path: string) => {
        const response = await fetch(origin + path);
        return { status: response.status, text: await response.text() };
      };
      const index = await get('/');
      expect(index.status).toBe(200);
      expect(index.text).toContain('<h1');
      expect(index.text, 'the page reloads when the pages are rebuilt').toContain('/@vite/client');
      expect((await get('/guide/lifecycle.html')).status).toBe(200);
      expect((await get('/assets/frame.html')).status).toBe(200);
      expect((await get('/assets/page.js')).status).toBe(200);
      const demo = await get('/demo-app.html');
      expect(demo.status).toBe(200);
      expect(demo.text).toContain('/src/samples/demo.tsx');
    } finally {
      await dev.close();
    }
  }, 120_000);
});

describe('in a browser', () => {
  it('opens every page without an error, and runs every live example in its frame', async () => {
    const problems: string[] = [];
    for (const path of pages) {
      const { page, errors } = await open(path);
      try {
        await showExamples(page);
        // The frames are given a moment to report what went wrong, if anything did.
        await page.waitForTimeout(100);
        const shown = await page.locator('.example-error:not([hidden])').allTextContents();
        problems.push(...errors.map((e) => `${path}: ${e}`), ...shown.map((e) => `${path}: an example reports ${e}`));
      } catch (error) {
        problems.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        await page.close();
      }
    }
    expect(problems).toEqual([]);
  }, 240_000);

  it('lets a reader edit an example, shows a mistake without losing the last good version, and resets it', async () => {
    const { page, errors } = await open('start/getting-started.html');
    try {
      await showExamples(page);
      const figure = page.locator('figure.example').first();
      const frame = page.frames().find((f) => f.url().includes('frame.html#counter-with-two-buttons'));
      if (!frame) throw new Error('the counter frame was not found');
      await expect.poll(() => frame.locator('span').first().textContent()).toBe('0');

      // The editor and the compiler are not in the page until they are asked for.
      expect(await page.locator('.editor').count()).toBe(0);
      await figure.getByRole('button', { name: 'Edit' }).click();
      await page.waitForSelector('.editor[data-ready]');

      const code = await figure.locator('textarea').inputValue();
      await figure.locator('textarea').fill(code.replace('reactive(0)', 'reactive(41)'));
      await expect.poll(() => frame.locator('span').first().textContent()).toBe('41');

      await figure.locator('textarea').fill('const = ;');
      await expect.poll(() => figure.locator('.example-error').isVisible()).toBe(true);
      expect(await frame.locator('span').first().textContent(), 'the last good version stays').toBe('41');

      await figure.getByRole('button', { name: 'Reset' }).click();
      await expect.poll(() => figure.locator('.example-error').isVisible()).toBe(false);
      await expect.poll(() => frame.locator('span').first().textContent()).toBe('0');
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('runs an edit that throws in the frame, and says so', async () => {
    const { page } = await open('start/getting-started.html');
    try {
      await showExamples(page);
      const figure = page.locator('figure.example').first();
      await figure.getByRole('button', { name: 'Edit' }).click();
      await page.waitForSelector('.editor[data-ready]');
      const code = await figure.locator('textarea').inputValue();
      await figure
        .locator('textarea')
        .fill(code.replace('const count = reactive(0);', "const count = reactive(0); throw new Error('boom');"));
      await expect.poll(() => figure.locator('.example-error').textContent()).toContain('boom');
    } finally {
      await page.close();
    }
  }, 60_000);

  it('searches every page, from any page, and opens the result', async () => {
    const { page, errors } = await open('guide/lifecycle.html');
    try {
      await page.keyboard.press('Control+k');
      await page.locator('dialog.search input').fill('Suspense');
      const first = page.locator('.search-results a').first();
      await first.waitFor({ timeout: 15_000 });
      expect(await page.locator('.search-results a').count()).toBeGreaterThan(1);
      await first.click();
      await page.waitForLoadState('load');
      expect(page.url().startsWith(base), `the result is under the site's own path: ${page.url()}`).toBe(true);
      expect(await page.locator('article h1').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('says so when it finds nothing', async () => {
    const { page } = await open('index.html');
    try {
      await page.keyboard.press('Control+k');
      await page.locator('dialog.search input').fill('zzzzqqqq');
      await page.locator('.search-none').waitFor({ timeout: 15_000 });
    } finally {
      await page.close();
    }
  }, 60_000);

  it('keeps the header and the sidebars at the top of a page that is shorter than the window', async () => {
    const { page } = await open('adr/0013-namespaces.html');
    try {
      await page.setViewportSize({ width: 1280, height: 3000 });
      const [header, side, main] = await page.evaluate(() =>
        ['.top', '.side', 'main'].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1),
      );
      const height = await page.evaluate(() => document.querySelector('.top')?.getBoundingClientRect().height ?? -1);
      expect([header, height < 80, side === height, main === height]).toEqual([0, true, true, true]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('switches the theme, in the page and in its frames', async () => {
    const { page } = await open('start/getting-started.html');
    try {
      await showExamples(page);
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.locator('[data-action=theme]').click();
      const after = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(after).not.toBe(before);
      const frame = page.frames().find((f) => f.url().includes('frame.html'));
      await expect.poll(() => frame?.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
      await page.reload();
      expect(await page.evaluate(() => document.documentElement.dataset.theme), 'the choice is remembered').toBe(after);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('shows a demo in its frame, with its source', async () => {
    const { page, errors } = await open('demos/todo.html');
    try {
      await page.evaluate(() => document.querySelectorAll('iframe').forEach((f) => f.setAttribute('loading', 'eager')));
      await expect.poll(() => page.frames().some((f) => f.url().includes('demo-app.html'))).toBe(true);
      const frame = page.frames().find((f) => f.url().includes('demo-app.html'));
      if (!frame) throw new Error('the demo frame was not found');
      await frame.waitForSelector('input', { timeout: 15_000 });
      await frame.fill('input', 'Write the docs');
      await frame.press('input', 'Enter');
      await expect.poll(() => frame.locator('li').count()).toBe(1);
      expect(await page.locator('.demo details .code').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
