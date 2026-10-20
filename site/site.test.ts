import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer } from 'vite-plus';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { allBlocks, markdownFiles } from '../tools/docs.ts';
import { pagesOf, serve } from './serve.ts';

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
  execSync(`pnpm vp build --config site/hydrate.config.ts --outDir ${JSON.stringify(out)} --emptyOutDir`, { cwd: root, stdio: 'pipe' });
  const files = walk(out).map((f) => relative(out, f).replace(/\\/g, '/'));
  pages = files.filter((f) => f.endsWith('.html') && !/^(assets|pagefind|demo)\//.test(f));
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

  it('labels what has no text for a person using a screen reader, and marks the current page', () => {
    const html = readFileSync(join(out, 'guide/lifecycle.html'), 'utf8');
    for (const label of [
      'Show the navigation',
      'Search the documentation',
      'Switch between the light and dark theme',
      'Documentation',
      'On this page',
      'Pages',
    ]) {
      expect(html, label).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('aria-current="page"');
    expect(html.match(/aria-label="Link to this section"/g)?.length, 'every heading has a link to itself').toBeGreaterThan(3);
  });

  it('tags every page for the search: its section, its topics from the front matter, and what it is for', () => {
    const page = (name: string) => readFileSync(join(out, name), 'utf8');
    const lifecycle = page('guide/lifecycle.html');
    expect(lifecycle).toContain('data-pagefind-filter="section:Guide"');
    for (const tag of ['lifecycle', 'effects', 'performance']) expect(lifecycle).toContain(`data-pagefind-filter="tag:${tag}"`);
    expect(lifecycle).toContain('content="Construct, mount, update, move and unmount: what runs when."');
    expect(lifecycle).toContain('data-pagefind-meta="description:Construct, mount, update, move and unmount: what runs when."');
    // A design decision is in the section of its folder, and has the topics it was given.
    expect(page('adr/0007-effects.html')).toContain('data-pagefind-filter="section:Reference"');
    expect(page('adr/0007-effects.html')).toContain('data-pagefind-filter="tag:effects"');
    // Every page is in a section, and every page but the indexes and the home page has a topic.
    const untagged = pages.filter((p) => {
      const html = page(p);
      return (
        !html.includes('data-pagefind-filter="section:') ||
        (!html.includes('data-pagefind-filter="tag:') && !/(^|\/)(index|README)\.html$/.test(p) && p !== 'index.html')
      );
    });
    expect(untagged).toEqual([]);
  });

  it('writes the whole page, hydratable, so that it is complete with no script, and the browser is sent only the code that does something', () => {
    const page = (name: string) => readFileSync(join(out, name), 'utf8');
    const lifecycle = page('guide/lifecycle.html');
    // The page is one app inside the element that the browser takes over, with what the server made for reading, and the buttons as they are before a script.
    expect(lifecycle).toContain('<div id="app" class="shell" data-root="../" data-pages="separate">');
    for (const action of ['menu', 'search', 'theme']) expect(lifecycle, action).toContain(`data-action="${action}"`);
    expect(lifecycle).toContain('<h2 id="mount">');
    // What does something is an island, in the shell and in the text, and each has the markup the component makes.
    for (const island of ['menu', 'search', 'theme', 'follow']) expect(lifecycle, island).toContain(`data-island="${island}"`);
    expect(lifecycle).not.toContain('page-data');
    const examples = page('start/getting-started.html');
    expect(examples, 'what the server makes for an island is in a slot').toContain('data-slot="content"');
    for (const island of ['example', 'code']) expect(examples, island).toContain('data-island="' + island + '"');
    expect(examples).toMatch(/data-action="edit"[^>]*hidden/);
    expect(examples).toMatch(/data-action="reset"[^>]*hidden/);
    // An example's props carry what the browser needs to make it again, as JSON that cannot end its attribute, and not the code, which is the page's.
    expect(examples).toMatch(/data-props="\{&quot;id&quot;:&quot;counter-with-two-buttons&quot;/);
    expect(examples).not.toMatch(/data-props="[^"]*npm install pipis/);
    // The one script is the page's, and the style sheet is linked: the editor and the search are loaded when asked, and the Markdown and the
    // highlighter are not in it, because what makes the text is the server's.
    const [, scriptPath] = /<script type="module" src="([^"]*)"/.exec(examples) ?? [];
    expect(scriptPath).toMatch(/^\.\.?\/assets\/page-[\w-]+\.js$/);
    expect(examples).toMatch(/<link rel="stylesheet" href="\.\.?\/assets\/page-[\w-]+\.css"/);
    const script = readFileSync(join(out, 'start', scriptPath ?? ''), 'utf8');
    for (const text of ['Lexer', 'renderCodeBlock', 'readFileSync']) expect(script, text).not.toContain(text);
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
    expect(files).toContain('demo/demo-app.html');
    expect(files.filter((f) => /pagefind-.*ui|pagefind-highlight/.test(f))).toEqual([]);
    expect(
      files.some((f) => /^assets\/edit-.*\.js$/.test(f)),
      'the editor is a chunk of its own',
    ).toBe(true);
  });
});

/** A page of the site that is served at `at`, opened in a fresh tab with its errors collected. */
async function openIn(at: string, path: string): Promise<{ page: Page; errors: string[] }> {
  const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  // A warning is a problem too: it is how a hydration says that the page was not what the app makes.
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(at + path);
  return { page, errors };
}

/** A page of the built site, opened in a fresh tab with its errors collected. */
const open = (path: string) => openIn(base, path);

/** Every iframe of the page loaded now, and the example in each shown. */
async function showExamples(page: Page) {
  const wanted = await page.evaluate(() => {
    document.querySelectorAll('iframe').forEach((f) => f.setAttribute('loading', 'eager'));
    return document.querySelectorAll('iframe[src*="frame.html"]').length;
  });
  // The frames start to load a moment after they are asked to, and are in the page's frames once they have.
  await expect.poll(() => page.frames().filter((f) => f.url().includes('frame.html')).length, { timeout: 15_000 }).toBe(wanted);
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || !frame.url().includes('frame.html')) continue;
    await frame.waitForFunction(() => (document.getElementById('root')?.childNodes.length ?? 0) > 0, undefined, { timeout: 15_000 });
  }
}

describe('the dev server', () => {
  it('serves the generated pages with the reload client, and the demo app as Vite serves any entry', async () => {
    const dev = await createServer({
      root,
      configFile: join(root, 'site/hydrate.config.ts'),
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
    });
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
      expect(index.text, 'the page reloads when the docs change').toContain('/@vite/client');
      expect(index.text, 'the page is the app, and its script is served by Vite as any module is').toContain('virtual:docs-client');
      // The style sheet is linked in the page, so that it is styled when it is painted and not when the script has run.
      const [, sheet] = /<link rel="stylesheet" href="([^"]*)"/.exec(index.text) ?? [];
      expect(sheet).toContain('virtual:docs/styles.css');
      const css = await fetch(origin + (sheet ?? ''), { headers: { accept: 'text/css' } });
      expect(css.headers.get('content-type')).toContain('text/css');
      expect(await css.text()).toContain('.example-code');
      expect((await get('/guide/lifecycle.html')).status).toBe(200);
      expect((await get('/assets/frame.html')).status).toBe(200);
      const demo = await get('/demo/demo-app.html');
      expect(demo.status).toBe(200);
      expect(demo.text).toContain('src/samples/demo.tsx');
      // The page is hydrated in a browser as Vite serves its modules, and the demo is served beside it by a Vite of its own.
      const page = await (browser as Browser).newPage();
      const problems: string[] = [];
      page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/[vite]/.test(m.text()) && problems.push(m.text()));
      page.on('pageerror', (e) => problems.push(e.message));
      try {
        await page.goto(origin + '/start/getting-started.html');
        await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false, undefined, {
          timeout: 60_000,
        });
        await page.locator('[data-action=theme]').click();
        expect(await page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/light|dark/);
        expect(problems).toEqual([]);
        await page.goto(origin + '/demo/demo-app.html#todo');
        await page.waitForFunction(() => document.body.childElementCount > 0, undefined, { timeout: 60_000 });
      } finally {
        await page.close();
      }
    } finally {
      await dev.close();
    }
  }, 180_000);
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
      // The example's height from here on: starting to edit does not make it vanish and come back.
      await page.evaluate(() => {
        const el = document.querySelector('figure.example');
        const sizes = [el?.getBoundingClientRect().height ?? 0];
        Object.assign(window, { sizes });
        if (el) new ResizeObserver(() => sizes.push(el.getBoundingClientRect().height)).observe(el);
      });
      await figure.getByRole('button', { name: 'Edit' }).click();
      await page.waitForSelector('.editor[data-ready]');
      await page.waitForTimeout(700);
      const sizes: number[] = await page.evaluate(() => (window as unknown as { sizes: number[] }).sizes);
      expect(Math.min(...sizes), `the example's height was ${sizes.join(', ')}`).toBeGreaterThan((sizes[0] ?? 0) - 40);
      expect(await frame.locator('span').first().textContent(), 'the example is not run again for the code it already shows').toBe('0');
      // The code that was written for reading, and its button, are replaced by the editor.
      expect(await figure.locator('[data-slot]').isVisible()).toBe(false);
      expect(await figure.locator('.example-code .copy').isVisible()).toBe(false);

      const code = await figure.locator('textarea').inputValue();
      // While the frame is run again its container is never empty for a moment: that is what makes the example vanish and come back, and its height with it.
      await frame.evaluate(() => {
        const root = document.getElementById('root');
        Object.assign(window, { emptied: 0 });
        if (root) {
          new MutationObserver(() => {
            if (root.childNodes.length === 0) Object.assign(window, { emptied: (window as unknown as { emptied: number }).emptied + 1 });
          }).observe(root, { childList: true });
        }
      });
      await figure.locator('textarea').fill(code.replace('reactive(0)', 'reactive(41)'));
      await expect.poll(() => frame.locator('span').first().textContent()).toBe('41');
      expect(
        await frame.evaluate(() => (window as unknown as { emptied: number }).emptied),
        'the frame was empty as it was run again',
      ).toBe(0);

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

  it('narrows a search by section and by topic, and lists the pages of a topic when nothing is typed', async () => {
    const { page, errors } = await open('guide/lifecycle.html');
    try {
      await page.keyboard.press('Control+k');
      const dialog = page.locator('dialog.search');
      // The chips are there before anything is typed, with how many pages each has.
      await dialog.locator('[data-filter=section] .search-chip', { hasText: /^Guide\d+/ }).waitFor({ timeout: 15_000 });
      const hrefs = () => dialog.locator('.search-results a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
      expect(await dialog.locator('.search-results li').count(), 'nothing is listed until something is asked').toBe(0);

      // A topic alone lists the pages that have it.
      await dialog.locator('[data-filter=tag] .search-chip', { hasText: /^ssr\d+/ }).click();
      await expect.poll(async () => (await hrefs()).length).toBeGreaterThanOrEqual(3);
      expect((await hrefs()).some((h) => h.endsWith('guide/server-rendering.html'))).toBe(true);
      for (const where of await dialog.locator('.search-where').allTextContents()) expect(where).toContain('ssr');

      // A section narrows it to the pages in that section.
      await dialog.locator('[data-filter=section] .search-chip', { hasText: /^Guide\d+/ }).click();
      await expect.poll(async () => (await hrefs()).every((h) => h.includes('/guide/')) && (await hrefs()).length > 0).toBe(true);
      expect(await dialog.locator('[data-filter=section] .search-chip[aria-pressed=true]').count()).toBe(1);

      // Words are searched among what is left, and the pages that match are the ones that have the topic, in the section.
      await dialog.locator('input').fill('render');
      await expect.poll(async () => (await hrefs()).length).toBeGreaterThan(0);
      expect((await hrefs()).every((h) => h.includes('/guide/'))).toBe(true);

      // Taking the chips off widens it again; with nothing typed and nothing chosen, nothing is listed.
      await dialog.locator('input').fill('');
      await dialog.locator('[data-filter=section] .search-chip', { hasText: /^All/ }).click();
      await dialog.locator('[data-filter=tag] .search-chip[aria-pressed=true]').click();
      await expect.poll(() => dialog.locator('.search-results li').count()).toBe(0);
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

  it('hydrates the page: it keeps every element the server wrote, says nothing, and shows the buttons that were hidden because there was no script', async () => {
    const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 900 } });
    const problems: string[] = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    // From when the page has been read until it is idle, every element that is put into the app or taken out of it.
    await page.addInitScript(() => {
      const changed: string[] = [];
      Object.assign(window, { changed });
      document.addEventListener('readystatechange', () => {
        if (document.readyState !== 'interactive') return;
        new MutationObserver((records) => {
          for (const r of records) {
            for (const n of [...r.addedNodes, ...r.removedNodes]) {
              if (n instanceof Element && (r.target as Element).closest?.('#app'))
                changed.push(`${n.nodeName.toLowerCase()} in ${(r.target as Element).nodeName.toLowerCase()}`);
            }
          }
        }).observe(document, { childList: true, subtree: true });
      });
    });
    try {
      await page.goto(base + 'start/getting-started.html');
      await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => (window as unknown as { changed: string[] }).changed)).toEqual([]);
      expect(problems).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('copies the code of a block, and says so', async () => {
    const { page } = await open('start/getting-started.html');
    try {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copy = page.locator('.code .copy').first();
      await copy.waitFor();
      await copy.click();
      await expect.poll(() => copy.textContent()).toBe('Copied');
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install pipis');
    } finally {
      await page.close();
    }
  }, 60_000);

  it('opens the navigation on a narrow screen', async () => {
    const { page } = await open('guide/lifecycle.html');
    try {
      await page.setViewportSize({ width: 390, height: 800 });
      expect(await page.locator('.side').isVisible()).toBe(false);
      await page.locator('[data-action=menu]').click();
      expect(await page.evaluate(() => document.body.classList.contains('menu-open'))).toBe(true);
      expect(await page.locator('.side').isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('marks the section that is being read in the contents', async () => {
    const { page } = await open('guide/lifecycle.html');
    try {
      await page.locator('#mount').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById('mount')?.scrollIntoView());
      await expect.poll(() => page.locator('.toc a[data-active]').first().getAttribute('href'), { timeout: 10_000 }).toBe('#mount');
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

describe('in islands mode', () => {
  // The same site, built so that the page's script mounts only the islands in it and does not hydrate the page (`mode: 'islands'`, in site/islands.config.ts): the page is
  // the same, what does something works the same, and the code for the page's own components is not in the script.
  const islandsOut = join(root, 'out', 'site-islands');
  let islandsBase = '';
  let islandsClose: (() => void) | undefined;

  beforeAll(async () => {
    execSync(`pnpm vp build --config site/islands.config.ts --outDir ${JSON.stringify(islandsOut)} --emptyOutDir`, {
      cwd: root,
      stdio: 'pipe',
    });
    const { server, url } = await serve(islandsOut, 0, PREFIX);
    islandsBase = url;
    islandsClose = () => server.close();
  }, 180_000);

  afterAll(() => islandsClose?.());

  const script = (dir: string) => {
    const html = readFileSync(join(dir, 'start/getting-started.html'), 'utf8');
    const [, path] = /<script type="module" src="([^"]*)"/.exec(html) ?? [];
    return readFileSync(join(dir, 'start', path ?? ''), 'utf8');
  };

  it('has a script without the page that the other mode hydrates, and the same islands', () => {
    const hydrating = script(out);
    const mounting = script(islandsOut);
    // The page's own components (the navigation's label is in the shell) are what hydrating needs and mounting islands does not, and neither is the
    // code that adopts what a server wrote: islands that are made again are the ordinary build of the library.
    expect(hydrating).toContain('On this page');
    expect(mounting).not.toContain('On this page');
    expect(hydrating).toContain('did not match');
    expect(mounting).not.toContain('did not match');
    expect(mounting.length).toBeLessThan(hydrating.length);
    for (const island of ['data-island', 'Copied']) expect(mounting, island).toContain(island);
  });

  it('works the same: the islands are mounted over what the server wrote, with no warning', async () => {
    const page = await (browser as Browser).newPage({ viewport: { width: 1280, height: 900 } });
    const problems: string[] = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    try {
      await page.goto(islandsBase + 'start/getting-started.html');
      await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false);
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.locator('[data-action=theme]').click();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).not.toBe(before);
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copy = page.locator('.code .copy').first();
      await copy.click();
      await expect.poll(() => copy.textContent()).toBe('Copied');
      expect(problems).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});

describe('as a single page', () => {
  // Every page of the Markdown on one page, in the order of the navigation, with the page made live as it is by default (hydrated). The same site, and
  // the same components; what is different is that a page is a section, so its headings are named for it and a link to a page is a link to it here.
  const singleOut = join(root, 'out', 'site-single');
  let singleBase = '';
  let singleClose: (() => void) | undefined;

  beforeAll(async () => {
    execSync(`pnpm vp build --config site/single.config.ts --outDir ${JSON.stringify(singleOut)} --emptyOutDir`, {
      cwd: root,
      stdio: 'pipe',
    });
    const { server, url } = await serve(singleOut, 0, PREFIX);
    singleBase = url;
    singleClose = () => server.close();
  }, 180_000);

  afterAll(() => singleClose?.());

  it('is one page with a section for every page of the docs, and no search index', () => {
    const files = walk(singleOut).map((f) => relative(singleOut, f).replace(/\\/g, '/'));
    const html = files.filter((f) => f.endsWith('.html') && !/^(assets|demo)\//.test(f));
    expect(html).toEqual(['index.html']);
    expect(
      files.some((f) => f.startsWith('pagefind/')),
      'the find of the browser is the search',
    ).toBe(false);
    const docs = join(root, 'docs');
    const sections = [...readFileSync(join(singleOut, 'index.html'), 'utf8').matchAll(/<article id="([^"]+)"/g)].map((m) => m[1]);
    expect(sections.length).toBe(markdownFiles(docs).length);
    expect(new Set(sections).size, 'each section has a name of its own').toBe(sections.length);
    // The examples are the same, and their frames are served from the same place.
    expect(files.filter((f) => f.startsWith('assets/examples/')).length).toBe(examples.length);
    // What the navigation lists comes first: the first section is the first page of the navigation, not the first file.
    expect(sections[0]).toBe('start-introduction');
  });

  it('names every heading for its page, and every link finds its place', async () => {
    const { page, errors } = await openIn(singleBase, '');
    try {
      const problems = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        const seen = new Set<string>();
        const found: string[] = [];
        for (const id of ids) {
          if (seen.has(id)) found.push(`'${id}' is the name of more than one element`);
          seen.add(id);
        }
        for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
          const target = decodeURIComponent(a.hash.slice(1));
          if (target && !document.getElementById(target)) found.push(`'${a.hash}' goes nowhere`);
        }
        return found;
      });
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('hydrates, and has the islands that it should: no search, and a navigation that follows what is read', async () => {
    const { page, errors } = await openIn(singleBase, '');
    try {
      await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false, undefined, {
        timeout: 30_000,
      });
      expect(await page.locator('[data-action=search]').count(), 'a single page has the find of the browser').toBe(0);
      expect(await page.locator('.toc').count()).toBe(0);
      // Reading another page moves the mark in the navigation to it.
      await page.evaluate(() => document.getElementById('guide-lifecycle')?.scrollIntoView());
      await expect
        .poll(() => page.locator('.side a[aria-current=page]').first().getAttribute('href'), { timeout: 10_000 })
        .toBe('#guide-lifecycle');
      // A link in the navigation goes to the page on this one.
      await page.locator('.side a[href="#guide-hydration"]').click();
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#guide-hydration');
      await expect
        .poll(() => page.evaluate(() => document.getElementById('guide-hydration')?.getBoundingClientRect().top ?? 9999), {
          timeout: 10_000,
        })
        .toBeLessThan(200);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('runs an example, and copies code, as a page of its own does', async () => {
    const { page } = await openIn(singleBase, '#start-getting-started');
    try {
      await page.evaluate(() => document.querySelectorAll('iframe').forEach((f) => f.setAttribute('loading', 'eager')));
      await expect
        .poll(() => page.frames().filter((f) => f.url().includes('frame.html#counter-with-two-buttons')).length, { timeout: 30_000 })
        .toBe(1);
      const frame = page.frames().find((f) => f.url().includes('frame.html#counter-with-two-buttons'));
      await expect.poll(() => frame?.locator('span').first().textContent(), { timeout: 30_000 }).toBe('0');
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      const copy = page.locator('#start-getting-started .code .copy').first();
      await copy.click();
      await expect.poll(() => copy.textContent()).toBe('Copied');
    } finally {
      await page.close();
    }
  }, 90_000);

  it('is served by the development server as the one page', async () => {
    const dev = await createServer({
      root,
      configFile: join(root, 'site/single.config.ts'),
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
    });
    await dev.listen();
    try {
      const address = dev.httpServer?.address();
      const origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
      const index = await fetch(`${origin}/`);
      expect(index.status).toBe(200);
      expect(((await index.text()).match(/<article id=/g) ?? []).length).toBe(markdownFiles(join(root, 'docs')).length);
      expect((await fetch(`${origin}/guide/lifecycle.html`)).status, 'there is no other page').toBe(404);
    } finally {
      await dev.close();
    }
  }, 120_000);

  it('can be made live with islands only, which is the same site with the other choice', async () => {
    const both = join(root, 'out', 'site-single-islands');
    execSync(`pnpm vp build --config site/single-islands.config.ts --outDir ${JSON.stringify(both)} --emptyOutDir`, {
      cwd: root,
      stdio: 'pipe',
    });
    const { server, url } = await serve(both, 0, PREFIX);
    const { page, errors } = await openIn(url, '');
    try {
      await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false, undefined, {
        timeout: 30_000,
      });
      await page.evaluate(() => document.getElementById('guide-lifecycle')?.scrollIntoView());
      await expect
        .poll(() => page.locator('.side a[aria-current=page]').first().getAttribute('href'), { timeout: 10_000 })
        .toBe('#guide-lifecycle');
      expect(errors).toEqual([]);
    } finally {
      await page.close();
      server.close();
    }
  }, 240_000);
});

describe('built for a server', () => {
  // The same site, but the build does not write the pages: it writes the browser's files, and beside them the server's code with a middleware that
  // renders a page when it is asked for (`build: 'server'`). The pages it renders are the pages that the build of files writes.
  const serverOut = join(root, 'out', 'site-server');
  const serverCode = `${serverOut}-server`;
  let serverBase = '';
  let serverClose: (() => void) | undefined;

  beforeAll(async () => {
    execSync(`pnpm vp build --config site/server.config.ts --outDir ${JSON.stringify(serverOut)} --emptyOutDir`, {
      cwd: root,
      stdio: 'pipe',
    });
    const { server, url } = await serve(serverOut, 0, PREFIX, await pagesOf(serverCode, PREFIX));
    serverBase = url;
    serverClose = () => server.close();
  }, 240_000);

  afterAll(() => serverClose?.());

  it('writes the browser’s files to the output folder, with no page, and the server beside it, out of reach of a host that serves files', () => {
    const files = walk(serverOut).map((f) => relative(serverOut, f).replace(/\\/g, '/'));
    expect(files.filter((f) => f.endsWith('.html') && !/^(assets\/frame\.html|demo\/)/.test(f))).toEqual([]);
    expect(files.some((f) => /^assets\/page-.*\.js$/.test(f))).toBe(true);
    expect(files).toContain('assets/frame.html');
    expect(files).toContain('demo/demo-app.html');
    expect(files, 'the search is built from the pages, which are not kept').toContain('pagefind/pagefind.js');
    const code = walk(serverCode).map((f) => relative(serverCode, f).replace(/\\/g, '/'));
    for (const file of ['server.js', 'handler.js', 'pages.json', 'assets.json']) expect(code, file).toContain(file);
    // The server has what it imports in it, so it needs no more than Node.
    expect(readFileSync(join(serverCode, 'server.js'), 'utf8')).not.toMatch(/from ['"](?:marked|prism-code-editor)/);
  });

  it('renders the pages that the build of files writes: every page, byte for byte', async () => {
    // (The files in the static build are named by their contents, so the same code has the same names.)
    const mismatches: string[] = [];
    for (const path of pages) {
      const response = await fetch(serverBase + path);
      const html = await response.text();
      if (response.status !== 200 || html !== readFileSync(join(out, path), 'utf8')) mismatches.push(path);
    }
    expect(mismatches).toEqual([]);
    expect((await fetch(serverBase)).status, 'the index is at the root').toBe(200);
  }, 120_000);

  it('leaves what is not its page to the next handler, and does not answer what is not asked for', async () => {
    expect((await fetch(`${serverBase}no/such/page.html`)).status).toBe(404);
    expect((await fetch(`${serverBase}guide/lifecycle.html`, { method: 'POST' })).status).toBe(404);
    const head = await fetch(`${serverBase}guide/lifecycle.html`, { method: 'HEAD' });
    expect([head.status, head.headers.get('content-type')]).toEqual([200, 'text/html; charset=utf-8']);
    // Outside the path that the site is served under it is not the site's.
    expect((await fetch(serverBase.replace(PREFIX, '/elsewhere/') + 'guide/lifecycle.html')).status).toBe(404);
  });

  it('works in a browser as the built files do: hydrated, with the search, and no warning', async () => {
    const { page, errors } = await openIn(serverBase, 'start/getting-started.html');
    try {
      await page.waitForFunction(() => document.querySelector('[data-action=edit]')?.hasAttribute('hidden') === false, undefined, {
        timeout: 30_000,
      });
      await page.keyboard.press('Control+k');
      await page.locator('dialog.search input').fill('Suspense');
      const first = page.locator('.search-results a').first();
      await first.waitFor({ timeout: 15_000 });
      await first.click();
      await page.waitForLoadState('load');
      expect(page.url().startsWith(serverBase), `the result is a page that the server renders: ${page.url()}`).toBe(true);
      expect(await page.locator('article h1').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 90_000);
});
