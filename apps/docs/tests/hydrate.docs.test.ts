import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { allBlocks } from '@pipis/docs-kit/blocks';
import type { HydrationReport } from 'pipis/hydrate';
import type { JSXElement } from 'pipis';
import { bundle, type BundleOptions } from './bundle.ts';

// A page that a server wrote is made live by the hydrating build of pipis (docs/adr/0021-hydration.md): the library's own check of it is
// packages/pipis/tools/hydrate.test.ts, over its fixtures. Here it is every live example of the documentation, rendered on the server, hydrated in
// jsdom, and compared with what the browser's build makes from nothing, each built the way an app's bundler builds it, with its conditions.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const out = join(root, 'out', 'hydrate');
const library = dirname(createRequire(import.meta.url).resolve('pipis/package.json'));
const src = (name: string) => join(library, 'src', name);
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

describe('hydrating the live examples of the documentation', () => {
  const live = allBlocks(repo).filter((b) => b.kind === 'live');
  // They make nodes with `document`, which a server has not got.
  const NEEDS_A_DOCUMENT = new Set(['an-element-with-a-node-of-its-own', 'an-element-built-with-dynamic']);

  it.each(live.filter((b) => !NEEDS_A_DOCUMENT.has(b.id)).map((b) => [b.id, b] as const))(
    'makes the page the browser makes: %s',
    async (id, block) => {
      mkdirSync(out, { recursive: true });
      const file = join(out, `${id}.tsx`);
      writeFileSync(file, block.code);
      const example = { ...alias, example: file };
      const server = await load<{ render(): Page }>(`example-${id}-server`, {
        contents: `import example from 'example'; import { renderToString } from 'pipis/server'; export const render = () => renderToString(example(), { hydratable: true });`,
        alias: example,
        platform: 'node',
        conditions: ['pipis-server'],
      });
      const hydrating = await load<Hydrator & { example(): JSXElement }>(`example-${id}-hydrate`, {
        contents: `import example from 'example'; export { hydrate } from 'pipis/hydrate'; export { example };`,
        alias: example,
        conditions: ['pipis-hydrate'],
      });
      const browser = await load<{ example(): JSXElement }>(`example-${id}-browser`, {
        contents: `import example from 'example'; export { example };`,
        alias: example,
      });
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const page = server.render();
        const hydrated = hydrateOf(hydrating, page, hydrating.example());
        const client = clientOf(browser.example());
        expect(hydrated.reports).toEqual([]);
        expect({ html: hydrated.html, head: hydrated.head }).toEqual(client);
      } finally {
        log.mockRestore();
      }
    },
    30_000,
  );
});
