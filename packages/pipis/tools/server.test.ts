import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';
import { bundle, type BundleOptions } from './bundle.ts';
import { generate } from './reflect.ts';
import { cases } from './server.fixtures.tsx';
import { HTML_TAGS, REFLECTED } from '../src/reflect.ts';
import { createNode, renderRoot, setAttribute } from '../src/platform.server.ts';
import type { JSXElement } from '../src/base.ts';

// The server renders the markup the browser build makes. Each piece of UI here is rendered twice: by the browser's build of pipis,
// into jsdom, and by the server's build, to a string, and the two are compared. That the server's build is the server's is a choice the
// bundler makes, and it is made here the way an app would make it: with the `pipis-server` condition.
//
// The one thing that is meant to differ is what a browser does with the page and a server does not. `Effect`, `Watch` and `Portal` do
// not run on a server, and a ref is not given; the examples that rely on them are compared on what they show before they run, and
// named below.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out', 'server-diff');
const src = (name: string) => join(root, 'src', name);
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
  it('is what packages/pipis/tools/reflect.ts writes from jsdom, so it cannot have drifted', () => {
    expect(readFileSync(join(root, 'src/reflect.ts'), 'utf8').replace(/\r\n/g, '\n')).toBe(generate());
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
      const { html } = renderRoot((parent) => (parent?.insertBefore(node, null), null), false);
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

describe('islands', () => {
  // A page is made on the server, with an island in it; the browser's entry mounts the islands of the page it is given. The two are built the way
  // an app builds them: the server with the condition, and the browser without it, and what the browser's build takes is only what it needs.
  const fixture = join(root, 'tools/server.islands.tsx');
  const imports = `import { Island, mountIslands } from 'pipis/islands'; import { Counter, components } from 'islands';`;

  async function build() {
    mkdirSync(out, { recursive: true });
    const options = {
      alias: { ...alias, 'pipis/islands': src('islands.ts'), islands: fixture },
      jsxImportSource: 'pipis',
      type: 'tsx',
    } as const;
    const server = await bundle({
      ...options,
      contents: `${imports} import { renderToString } from 'pipis/server';
export const page = () => renderToString(<main><h1>Static</h1><Island name="counter" component={Counter} props={{ start: 2, label: '</div> & "x"' }} /><p>Also static</p></main>).html;`,
      platform: 'node',
      conditions: ['pipis-server'],
    });
    const browser = await bundle({ ...options, contents: `${imports} export { mountIslands, components };` });
    const shipped = await bundle({ ...options, contents: `${imports} mountIslands(components);`, minify: true });
    writeFileSync(join(out, 'islands-server.mjs'), server);
    writeFileSync(join(out, 'islands-browser.mjs'), browser);
    return { shipped };
  }

  it('mounts an island over the markup the server wrote, and leaves the page around it as it was', async () => {
    const { shipped } = await build();
    const server: { page(): string } = await import(/* @vite-ignore */ pathToFileURL(join(out, 'islands-server.mjs')).href);
    const browser: { mountIslands(c: unknown, root?: ParentNode): () => void; components: unknown } = await import(
      /* @vite-ignore */ pathToFileURL(join(out, 'islands-browser.mjs')).href
    );
    const html = server.page();
    expect(html).toContain('data-island="counter"');
    expect(html).not.toContain('</div> &'); // the label's own markup is escaped

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const [title, tail] = [container.querySelector('h1'), container.querySelector('p')];
    const before = container.querySelector('button')?.textContent;
    expect(before, 'what the server wrote is already what the island shows').toBe('</div> & "x": 2');

    const unmount = browser.mountIslands(browser.components, container);
    const button = container.querySelector('button');
    button?.click();
    expect(button?.textContent).toBe('</div> & "x": 3');
    expect(container.querySelector('h1')).toBe(title);
    expect(container.querySelector('p')).toBe(tail);
    unmount();
    container.remove();

    // What is shipped for the browser: the mounting, and not what writes a marker or the server's platform.
    for (const text of ['acronym', 'contents', 'display', 'another render was in progress']) expect(shipped, text).not.toContain(text);
    expect(shipped).toContain('data-island');
  });
});
