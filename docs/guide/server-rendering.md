---
description: Rendering components to HTML on a server or at build time, and getting data to the browser.
tags: [ssr, platform, async]
---
# Server rendering

This page is for rendering pipis components to HTML on a server, or at build time to make a static site: the markup a visitor sees before any script has run, and what a search engine reads. The documentation you are reading is made this way.

A component does not change. The same source is built twice, once for the browser and once for the server, and the bundler decides which build of `pipis` each gets. Nothing in the component says which, and there is no special marker for code that is only for the browser.

## Rendering a page

`renderToString` takes an element and returns its markup, and the markup of what `Helmet` put in the head:

```tsx check title="Rendering a page on the server"
import { Helmet, reactive, select } from 'pipis';
import { renderToString, serializeData } from 'pipis/server';

function App(props: { user: string; items: string[] }) {
  const count = reactive(0);
  const label = select(count, (n) => `${props.user} clicked ${n} times`);
  return (
    <main>
      <Helmet>
        <title>{`${props.user}'s page`}</title>
      </Helmet>
      <button onclick={() => count.value++}>{label}</button>
      <ul>
        {props.items.map((item) => (
          <li>{item}</li>
        ))}
      </ul>
    </main>
  );
}

export function page(user: string, items: string[]): string {
  const { html, head } = renderToString(<App user={user} items={items} />);
  return `<!doctype html>
<html>
  <head>${head}</head>
  <body>
    <div id="app">${html}</div>
    <script type="application/json" id="data">${serializeData({ user, items })}</script>
    <script type="module" src="./client.js"></script>
  </body>
</html>`;
}
```

A reactive value is rendered as it is when the element is mounted, so `label` is `Ada clicked 0 times`. `renderToString` is synchronous: it mounts the element, reads its markup and unmounts it again, so nothing is left subscribed and a change after it reaches nothing. That is also why a component must not `await` while it is being rendered.

`serializeData` is for handing data to the browser. It makes JSON that is safe inside a `<script type="application/json">`: the characters that could end the script or begin another tag are written as escapes. The browser reads it with `JSON.parse(document.getElementById('data').textContent)` and passes it to the component as a prop, so the server and the browser start from the same data.

## Building the server

Which build of `pipis` an app gets is the bundler's choice, made with a condition. By default `pipis` is the browser's build. Build the server with the condition **`pipis-server`** and `pipis` is the server's build, for every file that imports it. In Vite:

```ts
// vite.config.ts, or the options of the server build
export default {
  ssr: {
    // Vite leaves packages out of a server build and lets Node load them, which does not know the condition: pipis has to be in it.
    noExternal: ['pipis'],
    resolve: { conditions: ['pipis-server'] },
  },
};
```

Other tools are given the same condition:

| Tool                  | Setting                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| Vite (server build)   | `ssr.resolve.conditions: ['pipis-server']` and `ssr.noExternal: ['pipis']`            |
| Rolldown and esbuild  | `conditions: ['pipis-server']` (`resolve.conditionNames` in Rolldown's own options)   |
| Node, without bundling | `node --conditions=pipis-server server.js`                                            |
| Vitest, to test a server render | `resolve.conditions` and `ssr.resolve.conditions` of `['pipis-server']`, with `server.deps.inline: ['pipis']` |
| TypeScript            | nothing: both builds have the same types                                              |

Everything else is the browser's by default, so a plain Node script, a test in jsdom and an ordinary browser bundle need no setting. If a server build is missing the condition, the first element it renders throws `document is not defined`, and `renderToString` itself says which setting is missing. It never renders the wrong thing without saying.

For a static site, render each page and write the file. This is how this site is built (see `site/build.ts` in the repository):

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { page } from './render.ts';

for (const [path, user] of [['ada.html', 'Ada'], ['grace.html', 'Grace']]) {
  mkdirSync('dist', { recursive: true });
  writeFileSync(`dist/${path}`, page(user, ['one', 'two']));
}
```

## What runs on the server

The server has no screen, so what is for a screen does not run:

| Thing                                    | On the server                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Reactive values                          | Rendered as they are when the element is mounted                       |
| `If`, `OneOf`, `List`, `ReactiveList`, `Dynamic` | Render their current content, with a comment where the region begins |
| `Effect`, `Watch`                        | Not run                                                                |
| `Suspense`                               | Shows `loading`, and does not start the promise                        |
| `Portal`                                 | Not rendered (it is rendered by an effect)                             |
| `Helmet`                                 | Goes to `head` of the result                                           |
| `ErrorBoundary`                          | Works as in the browser: a child that throws shows the fallback        |
| Event handlers (`onclick`, ...)          | Not written                                                            |
| `ref`                                    | Not called: there is no node a page has                                |
| The state of a form control (`value`, `checked`, `selected`) | Written as the attribute a page starts from, and a `textarea`'s value as its content |
| A prop that is given nothing (`null` or `undefined`) | The attribute is left out, as it is in the browser's build. (`false` is a value: `draggable={false}` is `draggable="false"`.) |

The markup is what the browser's build makes: an HTML tag is HTML, any other tag is SVG, `className` is `class`, `htmlFor` is `for`, a `style` is its declarations, and text and attributes are escaped. `tools/server.test.ts` renders the same components both ways, with the browser's build in jsdom, and compares the markup, including every live example of this documentation.

## Code that is only for the browser

A component body runs on the server too, so it cannot read `localStorage`, `window` or `matchMedia` there. Put such code in an `Effect` or a `Watch`, which the server does not run, or guard it with `IS_CLIENT`:

```tsx check title="Code that is only for the browser"
import { IS_CLIENT, reactive, select } from 'pipis';

export default function Theme() {
  // The server renders the default, and the browser reads the stored choice.
  const theme = reactive(IS_CLIENT ? (localStorage.getItem('theme') ?? 'light') : 'light');
  return <p>{select(theme, (t) => `The theme is ${t}`)}</p>;
}
```

`IS_CLIENT` is `true` in the browser's build and `false` in the server's. It is a constant, not something read at run time, so the bundler removes the branch that cannot be taken: the browser's bundle has no trace of the server's side, and the server's has none of the browser's.

A custom element that creates its nodes with `document` (see [Custom elements](custom-elements.md)) is for the browser: on the server there is no `document`. Guard it the same way.

## Data for the browser: a recipe

A page that is made from data (a list of posts, a user) needs the same data in the browser, or the browser's copy would be made from nothing. `serializeData` is the primitive for it, and this is the shape most apps want: a **data function**. A component calls `data('posts', ...)` and gets the data, on the server and in the browser alike, so the component is written once. On the server the call gets the data and writes it into the page as a `<script type="application/json">`; in the browser it reads that script back.

```tsx check title="A data function for the browser" id=data
import { IS_CLIENT, defineContext, type JSXElement } from 'pipis';
import { renderToString, serializeData } from 'pipis/server';

/** What the server has written for the render in progress. A render is synchronous, so one map does. */
const written = new Map<string, string>();

/** What the server fetched before the render (a database, an API), by name: what the components read their data from. */
const [withPrefetched, getPrefetched] = defineContext<Record<string, unknown>>({});

/**
 * The data a component needs, the same on the server and in the browser. On the server it is what `get` returns, and it is written into the
 * page as the script `data-<id>`. In the browser it is read back from that script, and `get` is `false`: see `Posts` below.
 */
export function data<T>(id: string, get: false | (() => T)): T {
  if (!/^[\w-]+$/.test(id)) throw new Error(`'${id}' cannot be the id of data: use letters, digits, - and _.`);
  if (IS_CLIENT) {
    const script = document.getElementById(`data-${id}`);
    if (!script) throw new Error(`The page has no data '${id}': the server did not write it.`);
    return JSON.parse(script.textContent ?? 'null');
  }
  if (!get) throw new Error(`The server was given no way to get the data '${id}'.`);
  if (written.has(id)) throw new Error(`The data '${id}' was asked for twice in one render.`);
  const value = get();
  written.set(id, serializeData(value));
  return value;
}

/** Renders `app` on the server, with `prefetched` for its components to read, and returns the page's pieces and the data scripts to put in the body. */
export function renderWithData(app: () => JSXElement, prefetched: Record<string, unknown>) {
  written.clear();
  // The provider is around the render and not only around `app()`: the rows of a list are made while it renders.
  const { html, head } = withPrefetched(prefetched, () => renderToString(app()));
  const scripts = [...written].map(([id, json]) => `<script type="application/json" id="data-${id}">${json}</script>`).join('');
  written.clear();
  return { html, head, scripts };
}

type Post = { id: number; title: string };

export function Posts() {
  // `!IS_CLIENT && ...` is `false` in the browser's build, so the code that gets the posts is not in it. Written as a function that is passed,
  // it would be: the bundler cannot tell that `data` ignores it.
  const posts = data<Post[]>('posts', !IS_CLIENT && (() => getPrefetched().posts as Post[]));
  return (
    <ul>
      {posts.map((post) => (
        <li>{post.title}</li>
      ))}
    </ul>
  );
}
```

The server fetches before it renders, which is its own business and can be asynchronous, and then renders with what it got:

```tsx check title="Using the data function on the server"
import { Posts, renderWithData } from './data.tsx';

declare function loadPosts(): Promise<{ id: number; title: string }[]>;

export async function page(): Promise<string> {
  const posts = await loadPosts();
  const { html, head, scripts } = renderWithData(() => <Posts />, { posts });
  return `<!doctype html><html><head>${head}</head><body><div id="app">${html}</div>${scripts}<script type="module" src="./client.js"></script></body></html>`;
}
```

In the browser, `Posts()(container)` reads the data from the page and builds the same list. Things the recipe leans on, and what to know:

- **The guard is at the call.** `!IS_CLIENT && (() => ...)` is the whole trick: `IS_CLIENT` is a constant, so in the browser's build the argument is `false` and the function, and whatever it imports, is gone; and inside `data` the browser's branch and the server's are each removed from the other's build. The check that the bundler does this is in `tools/server.test.ts`, which builds the recipe both ways.
- **The data is JSON.** What comes back in the browser is what `JSON.parse` makes: a `Date` is a string, and a `Map` is lost. Send plain data. The function does not check the shape in the browser; a parser such as zod, given as another argument, is the place for that.
- **Fetching is the server's, before the render.** A render is synchronous (a component cannot `await`), so what a component asks for has to be there already: fetch it first and hand it over, here with a context. A context is read when a component is made, and the rows of a `List` are made during the render, so the provider wraps the render and not only the call that makes the element.
- **Ids are unique.** Two calls with one id throw on the server, and a missing script throws in the browser, naming it.

## The browser's side

The browser does not adopt the server's markup. It mounts the component into the page itself, which replaces what the server wrote, so a page is complete and readable before the script runs, and then the script takes over. Mount the client's copy with the same data the server was given:

```tsx check title="Mounting in the browser over the server's markup"
import { reactive } from 'pipis';

function App(props: { user: string }) {
  const count = reactive(0);
  return <button onclick={() => count.value++}>{props.user}</button>;
}

const data: { user: string } = JSON.parse(document.getElementById('data')?.textContent ?? '{}');
const container = document.getElementById('app');
if (container) {
  container.textContent = '';
  App(data)(container);
}
```

## Limits

- One render at a time: `renderToString` throws if it is called while another is running, which can only happen if a component calls it.
- Rendering is synchronous. Data is passed in as a prop; `Suspense` is for the browser.
- What a page does after the markup arrives (the clicks, the effects) is the browser's: nothing on the server survives its render.
