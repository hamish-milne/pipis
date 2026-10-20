import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { bundle, type BundleOptions } from './bundle.ts';
import { allBlocks } from './docs.ts';
import { generate } from './reflect.ts';
import { cases } from './server.fixtures.tsx';
import { HTML_TAGS, REFLECTED } from '../src/pipis/reflect.ts';
import { createNode, renderRoot, setAttribute } from '../src/pipis/platform.server.ts';
import { serializeData } from '../src/pipis/server.ts';
import type { JSXElement } from '../src/pipis/base.ts';

// The server renders the markup the browser build makes. Each piece of UI here is rendered twice: by the browser's build of pipis,
// into jsdom, and by the server's build, to a string, and the two are compared. That the server's build is the server's is a choice the
// bundler makes, and it is made here the way an app would make it: with the `pipis-server` condition.
//
// The one thing that is meant to differ is what a browser does with the page and a server does not. `Effect`, `Watch` and `Portal` do
// not run on a server, and a ref is not given; the examples that rely on them are compared on what they show before they run, and
// named below.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out', 'server-diff');
const src = (name: string) => join(root, 'src/pipis', name);
const alias = {
  pipis: src('index.ts'),
  'pipis/server': src('server.ts'),
  'pipis/jsx-runtime': src('jsx-runtime.ts'),
  'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
};

/** A bundle as a module that is imported. */
async function load<T>(name: string, options: BundleOptions): Promise<T> {
  const code = await bundle({ alias, jsxImportSource: 'pipis', ...options });
  const file = join(out, `${name}.mjs`);
  writeFileSync(file, code);
  return await import(/* @vite-ignore */ pathToFileURL(file).href);
}

type Markup = { html: string; head: string };

/**
 * What a browser makes of a control's state is a property, which is not in its markup; what a server writes is the attribute a page
 * starts from. So the browser's side is read as the attributes it would have if its properties were the page's start.
 */
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

/** Mounts in jsdom, with the browser's build, and reads the markup. */
function inBrowser(element: JSXElement): Markup {
  document.head.innerHTML = '';
  const container = document.createElement('div');
  document.body.append(container);
  element(container);
  withState(container);
  const result = { html: container.innerHTML, head: document.head.innerHTML };
  element();
  container.remove();
  return result;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('what the server needs to know about HTML', () => {
  it('is what tools/reflect.ts writes from jsdom, so it cannot have drifted', () => {
    expect(readFileSync(join(root, 'src/pipis/reflect.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(generate());
  });

  it('writes every reflected prop as the attribute jsdom does, for the tags that have it', () => {
    const wrong: string[] = [];
    for (const [prop, [attribute, kind]] of Object.entries(REFLECTED)) {
      const value = kind === 'boolean' ? true : kind === 'number' ? 5 : 'probe';
      const written = kind === 'boolean' ? '' : String(value);
      // A tag that has the attribute: the first one whose element in jsdom writes the value as it is given (a canvas's size, for one, is a number there).
      const tag = HTML_TAGS.find((t) => {
        const el = document.createElement(t);
        Reflect.set(el, prop, value);
        return el.getAttribute(attribute) === written;
      });
      if (!tag) continue;
      const el = document.createElement(tag);
      Reflect.set(el, prop, value);
      const node = createNode(tag);
      setAttribute(node, prop, value);
      const { html } = renderRoot((parent) => (parent?.insertBefore(node, null), null));
      const expected = el.outerHTML;
      if (html !== expected) wrong.push(`<${tag}> ${prop}=${String(value)}: ${html} is not ${expected}`);
    }
    expect(wrong).toEqual([]);
  });

  it('knows exactly the tags that jsdom makes HTML elements of', () => {
    expect(HTML_TAGS.filter((t) => document.createElement(t) instanceof HTMLUnknownElement)).toEqual([]);
    for (const tag of ['svg', 'path', 'circle', 'foo', 'bar-less']) expect(HTML_TAGS.includes(tag)).toBe(false);
  });
});

describe('the markup of the server and the browser', () => {
  let server: { render(name: string): Markup };

  beforeAll(async () => {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    server = await load('fixtures', {
      contents: `import { renderToString } from 'pipis/server'; import { cases } from 'fixtures'; export const render = (name) => renderToString(cases[name]());`,
      alias: { ...alias, fixtures: join(root, 'tools/server.fixtures.tsx') },
      platform: 'node',
      conditions: ['pipis-server'],
    });
  }, 60_000);

  it.each(Object.keys(cases))('is the same for %s', (name) => {
    const make = cases[name];
    if (!make) throw new Error(name);
    expect(server.render(name)).toEqual(inBrowser(make()));
  });
});

describe('the data function of the guide to server rendering', () => {
  // The recipe is documentation, so it is built and run as it is written there: for the server, which writes the data into the page, and
  // for the browser, which reads it back, and what the browser makes is what the server wrote.
  const block = allBlocks(root).find((b) => b.id === 'data');
  const posts = [
    { id: 1, title: 'A </script> & b' },
    { id: 2, title: 'Two' },
  ];
  type Server = {
    renderWithData(app: () => JSXElement, prefetched: Record<string, unknown>): { html: string; head: string; scripts: string };
    Posts(): JSXElement;
  };
  type Browser = { Posts(): JSXElement };
  let serverCode = '';
  let browserCode = '';

  beforeAll(async () => {
    mkdirSync(out, { recursive: true });
    if (!block) throw new Error("the guide has no block with the id 'data'");
    const file = join(out, 'data.tsx');
    writeFileSync(file, block.code);
    // The server's entry uses all of it. The browser's entry uses what a page of the browser's would: the component, and not the server's `renderWithData`.
    serverCode = await bundle({
      contents: `export * from 'data';`,
      alias: { ...alias, data: file },
      jsxImportSource: 'pipis',
      platform: 'node',
      conditions: ['pipis-server'],
    });
    browserCode = await bundle({ contents: `export { Posts } from 'data';`, alias: { ...alias, data: file }, jsxImportSource: 'pipis' });
    writeFileSync(join(out, 'data-server.mjs'), serverCode);
    writeFileSync(join(out, 'data-browser.mjs'), browserCode);
  }, 60_000);

  it('writes the data into the page on the server, and the browser reads the same data back and makes the same markup', async () => {
    const server: Server = await import(/* @vite-ignore */ pathToFileURL(join(out, 'data-server.mjs')).href);
    const browser: Browser = await import(/* @vite-ignore */ pathToFileURL(join(out, 'data-browser.mjs')).href);
    const { html, head, scripts } = server.renderWithData(() => server.Posts(), { posts });
    expect(head).toBe('');
    expect(html).toBe('<ul><li>A &lt;/script&gt; &amp; b</li><li>Two</li></ul>');
    expect(scripts).toBe(`<script type="application/json" id="data-posts">${serializeData(posts)}</script>`);
    expect(scripts.split('</script>').length, 'the data cannot end its own script').toBe(2);

    document.body.innerHTML = scripts;
    const container = document.createElement('div');
    document.body.append(container);
    browser.Posts()(container);
    expect(container.innerHTML).toBe(html);
    document.body.innerHTML = '';
  });

  it('says what is wrong when the page has no data', async () => {
    const browser: Browser = await import(/* @vite-ignore */ pathToFileURL(join(out, 'data-browser.mjs')).href);
    document.body.innerHTML = '';
    expect(() => browser.Posts()).toThrow("The page has no data 'posts'");
  });

  it('is a different program in each build: what is for the other side is not in it', async () => {
    // As an app ships it: minified, which is what removes the branch that cannot be taken. The names are mangled, so the text that is in what
    // is looked for is the messages and the tables.
    const file = join(out, 'data.tsx');
    const shipped = (contents: string, more: Partial<BundleOptions> = {}) =>
      bundle({ contents, alias: { ...alias, data: file }, jsxImportSource: 'pipis', minify: true, ...more });
    const browser = await shipped(`export { Posts } from 'data';`);
    const server = await shipped(`export * from 'data';`, { platform: 'node', conditions: ['pipis-server'] });
    // The server's table of HTML, the way the data is written, and the code that gets it are not in the browser's build...
    for (const text of ['acronym', 'asked for twice', 'given no way', 'another render was in progress', 'application/json']) {
      expect(browser, text).not.toContain(text);
    }
    expect(browser).toContain('getElementById');
    // ...and the reading of the page is not in the server's.
    expect(server).not.toContain('getElementById');
    expect(server).toContain('asked for twice');
  });
});

describe('the live examples of the documentation', () => {
  const live = allBlocks(root).filter((b) => b.kind === 'live');
  // They make nodes with `document`, which a server has not got: they are for a browser, and the server says so.
  const NEEDS_A_DOCUMENT = new Set(['an-element-with-a-node-of-its-own', 'an-element-built-with-dynamic']);
  // What a browser's effects add to the page, and a server's do not run: the markup on the server is the browser's without it.
  const WITHOUT_EFFECTS: Record<string, (browser: Markup) => Markup> = {
    // An effect that sets `document.title`.
    watch: (m) => ({ ...m, head: '' }),
    // A portal is rendered by an effect, into the place the target marks.
    portal: (m) => ({ ...m, html: m.html.replace('<p>This is rendered in the portal target</p>', '') }),
  };

  it.each(live.map((b) => [b.id, b] as const))(
    'shows the same markup on the server and in a browser: %s',
    async (id, block) => {
      if (NEEDS_A_DOCUMENT.has(id)) {
        expect(block.code, `${id} is not compared because it uses \`document\``).toContain('document.');
        return;
      }
      const file = join(out, `${id}.tsx`);
      mkdirSync(out, { recursive: true });
      writeFileSync(file, block.code);
      const entry = (render: string) => `import example from 'example'; ${render}`;
      const server = await load<{ render(): Markup }>(`example-${id}-server`, {
        contents: entry(`import { renderToString } from 'pipis/server'; export const render = () => renderToString(example());`),
        alias: { ...alias, example: file },
        platform: 'node',
        conditions: ['pipis-server'],
      });
      const browser = await load<{ render(): JSXElement }>(`example-${id}-browser`, {
        contents: entry('export const render = () => example();'),
        alias: { ...alias, example: file },
      });
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const serverMarkup = server.render();
        const browserMarkup = inBrowser(browser.render());
        expect(serverMarkup).toEqual(WITHOUT_EFFECTS[id]?.(browserMarkup) ?? browserMarkup);
      } finally {
        log.mockRestore();
      }
    },
    30_000,
  );
});
