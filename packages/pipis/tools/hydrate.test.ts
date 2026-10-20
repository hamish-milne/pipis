import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { bundle, type BundleOptions } from './bundle.ts';
import { cases } from './server.fixtures.tsx';
import type { JSXElement } from '../src/base.ts';
import type { HydrationReport } from '../src/hydrate.ts';

// A page that a server wrote is made live by the hydrating build of pipis (docs/adr/0021-hydration.md). Each piece of UI here is rendered
// three times: on the server, as markup that can be hydrated; hydrated, in jsdom, from that markup; and made by the browser's build, in jsdom, from
// nothing. The hydrated page has to be the page the browser makes, and made of the nodes that the server wrote. The three builds are made the way an
// app makes them: with the conditions its bundler is given.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out', 'hydrate');
const src = (name: string) => join(root, 'src', name);
const alias = {
  pipis: src('index.ts'),
  'pipis/server': src('server.ts'),
  'pipis/hydrate': src('hydrate.ts'),
  'pipis/jsx-runtime': src('jsx-runtime.ts'),
  'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
};

async function load<T>(name: string, options: BundleOptions): Promise<T> {
  const code = await bundle({ alias, jsxImportSource: 'pipis', ...options });
  const file = join(out, `${name}.mjs`);
  writeFileSync(file, code);
  return await import(/* @vite-ignore */ pathToFileURL(file).href);
}

type Page = { html: string; head: string };
type Hydrator = { hydrate(container: Element, element: JSXElement, options?: { onMismatch?: (report: HydrationReport) => void }): void };

const descendants = (root: Node) => {
  const nodes = new Set<Node>();
  const walk = (node: Node) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      nodes.add(child);
      walk(child);
    }
  };
  walk(root);
  return nodes;
};

/** What a control shows is a property, and what a server writes is the attribute a page starts from: both sides are read as the attributes their properties would be. */
function withState(container: Element) {
  for (const el of container.querySelectorAll('input, textarea, option')) {
    if (el instanceof HTMLInputElement) {
      const checkable = el.type === 'checkbox' || el.type === 'radio';
      if (el.value !== (el.getAttribute('value') ?? (checkable ? 'on' : ''))) el.setAttribute('value', el.value);
      if (el.checked !== el.defaultChecked) el.toggleAttribute('checked', el.checked);
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.value !== el.defaultValue) el.textContent = el.value;
    } else if (el instanceof HTMLOptionElement && el.selected !== el.defaultSelected) {
      el.toggleAttribute('selected', el.selected);
    }
  }
}

function reset() {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
}

/** What a hydration of `page` makes: the container and head as they are after, with what it reported, and whether it kept the server's nodes. */
function hydrateOf(hydrator: Hydrator, page: Page, element: JSXElement) {
  reset();
  document.head.innerHTML = page.head;
  const container = document.createElement('div');
  container.innerHTML = page.html;
  document.body.append(container);
  const before = descendants(container);
  const reports: HydrationReport[] = [];
  hydrator.hydrate(container, element, { onMismatch: (r) => reports.push(r) });
  withState(container);
  const made = [...descendants(container)].filter((n) => !before.has(n) && !(n instanceof Text && n.data === ''));
  const result = { html: container.innerHTML, head: document.head.innerHTML, reports, made: made.map((n) => n.nodeName) };
  element();
  return result;
}

function clientOf(element: JSXElement): Page {
  reset();
  const container = document.createElement('div');
  document.body.append(container);
  element(container);
  withState(container);
  const result = { html: container.innerHTML, head: document.head.innerHTML };
  element();
  return result;
}

afterEach(reset);

describe('hydrating the markup of the server', () => {
  let server: { render(name: string): Page };
  let hydrating: Hydrator & { cases: Record<string, () => JSXElement> };
  let browser: { cases: Record<string, () => JSXElement> };

  beforeAll(async () => {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const fixtures = { ...alias, fixtures: join(root, 'tools/server.fixtures.tsx') };
    server = await load('fixtures-server', {
      contents: `import { renderToString } from 'pipis/server'; import { cases } from 'fixtures'; export const render = (name) => renderToString(cases[name](), { hydratable: true });`,
      alias: fixtures,
      platform: 'node',
      conditions: ['pipis-server'],
    });
    hydrating = await load('fixtures-hydrate', {
      contents: `export { hydrate } from 'pipis/hydrate'; export { cases } from 'fixtures';`,
      alias: fixtures,
      conditions: ['pipis-hydrate'],
    });
    browser = await load('fixtures-browser', { contents: `export { cases } from 'fixtures';`, alias: fixtures });
  }, 60_000);

  it.each(Object.keys(cases))('makes the page the browser makes, of the nodes the server wrote: %s', (name) => {
    const make = hydrating.cases[name];
    const fresh = browser.cases[name];
    if (!make || !fresh) throw new Error(name);
    const page = server.render(name);
    const hydrated = hydrateOf(hydrating, page, make());
    const client = clientOf(fresh());
    expect(hydrated.reports).toEqual([]);
    // The markers that the server wrote for a text node are gone, and what is left is what a browser makes.
    expect({ html: hydrated.html, head: hydrated.head }).toEqual(client);
    expect(hydrated.made, 'nodes that the server had not written').toEqual([]);
  });
});

describe('what each build has', () => {
  // As an app ships it: minified, which is what removes the branch that cannot be taken. The messages are what is looked for.
  const app = `import { createElement, reactive } from 'pipis'; import { hydrate } from 'pipis/hydrate'; export { hydrate, createElement, reactive };`;
  const ship = (conditions?: string[]) => bundle({ contents: app, alias, minify: true, ...(conditions ? { conditions } : {}) });

  it('has the finding of nodes only in the build that hydrates', async () => {
    const hydrating = await ship(['pipis-hydrate']);
    const browser = await ship();
    expect(hydrating).toContain('another page was being hydrated');
    expect(hydrating).toContain('did not match');
    expect(browser).not.toContain('another page was being hydrated');
    expect(browser).not.toContain('did not match');
    expect(browser).toContain('needs the hydrating build');
    expect(hydrating).not.toContain('needs the hydrating build');
  });
});

describe('islands, hydrated', () => {
  // A page whose text is static and has an island in it, made on the server, hydrated, and its island mounted: nothing the server wrote is replaced.
  const fixture = join(root, 'tools/server.islands.tsx');
  const options = {
    alias: { ...alias, 'pipis/islands': src('islands.ts'), islands: fixture },
    jsxImportSource: 'pipis',
    type: 'tsx',
  } as const;
  const imports = `import { Island, mountIslands } from 'pipis/islands'; import { Static } from 'pipis/hydrate'; import { Counter, components } from 'islands';`;

  it('adopts the markup of a page and of the islands in its static text, with nothing made again', async () => {
    mkdirSync(out, { recursive: true });
    const server = await load<{ render(): string }>('islands-server', {
      ...options,
      contents: `${imports} import { renderToString } from 'pipis/server';
const page = () => <main><h1>Title</h1><Static>{() => <section><p>Text</p><Island name="counter" component={Counter} props={{ start: 2, label: 'n' }} /></section>}</Static><Island name="counter" component={Counter} props={{ start: 7, label: 'm' }} /></main>;
export const render = () => renderToString(page(), { hydratable: true }).html;`,
      platform: 'node',
      conditions: ['pipis-server'],
    });
    const browser = await load<{ start(container: Element): void }>('islands-hydrate', {
      ...options,
      contents: `${imports} import { hydrate } from 'pipis/hydrate';
const page = () => <main><h1>Title</h1><Static /><Island name="counter" component={Counter} props={{ start: 7, label: 'm' }} /></main>;
export const start = (container) => { hydrate(container, page()); mountIslands(components, container); };`,
      conditions: ['pipis-hydrate'],
    });
    reset();
    const container = document.createElement('div');
    container.innerHTML = server.render();
    document.body.append(container);
    const before = descendants(container);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      browser.start(container);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    const kept = [...descendants(container)].filter((n) => !before.has(n) && !(n instanceof Text && n.data === ''));
    expect(kept.map((n) => n.nodeName)).toEqual([]);
    const buttons = container.querySelectorAll('button');
    expect([...buttons].map((b) => b.textContent)).toEqual(['n: 2', 'm: 7']);
    buttons[0]?.click();
    buttons[1]?.click();
    expect([...buttons].map((b) => b.textContent)).toEqual(['n: 3', 'm: 8']);
  }, 30_000);
});
