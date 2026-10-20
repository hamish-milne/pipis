---
description: A page made on a server with a few interactive components, mounted in the browser over what the server wrote, and nothing else downloaded.
tags: [ssr, components, size]
---

# Islands

This page is for a page that is mostly not interactive: documentation, an article, a shop's listing. The server makes all of it, as HTML, so it is complete and readable with no script. The few parts that do something (a switch, a search, a counter) are **islands**: components that the browser mounts over what the server wrote. The browser downloads those components and nothing of the rest of the page, which it never needed.

An island is an ordinary component, used twice. The page uses it on the server, where `Island` writes its markup inside a marker that says which component it is and what its props were. The browser's script finds the markers and mounts the component of that name over each. This documentation site is made this way: [site/islands.tsx](https://github.com/neofox-solutions/pipis/blob/main/site/islands.tsx) in the repository is its theme switch, its search button, its copy buttons, the bar of each live example and the contents that follow you, and nothing else in the page is a script.

## An island

An island is a component, written like any other:

```tsx check title="An island" id=counter
import { reactive, select } from 'pipis';

export function Counter(props: { start: number }) {
  const count = reactive(props.start);
  return <button onclick={() => count.value++}>{select(count, (n) => `Clicked ${n} times`)}</button>;
}
```

The page, on the server, uses it with `Island`, which takes the component, the name the browser will find it by, and its props:

```tsx check title="A page with an island, on the server"
import { Island } from 'pipis/islands';
import { renderToString } from 'pipis/server';
import { Counter } from './counter.tsx';

export function page(): string {
  const { html } = renderToString(
    <main>
      <h1>A mostly static page</h1>
      <p>Everything here, but the button, is plain HTML.</p>
      <Island name="counter" component={Counter} props={{ start: 3 }} />
    </main>,
  );
  return `<!doctype html><html><body>${html}<script type="module" src="./client.js"></script></body></html>`;
}
```

The markup it writes is the component's own, inside an element with `display: contents`, so the marker takes no part in the layout:

```html
<main>
  <h1>A mostly static page</h1>
  <p>Everything here, but the button, is plain HTML.</p>
  <div data-island="counter" data-props="{&quot;start&quot;:3}" style="display: contents;"><button>Clicked 3 times</button></div>
</main>
```

The browser's script gives `mountIslands` every island the page may have, by name:

```ts check title="The browser's script for a page with islands"
import { mountIslands } from 'pipis/islands';
import { Counter } from './counter.tsx';

mountIslands({ counter: Counter });
```

`mountIslands` finds each marker, makes the component with the props it carries, and mounts it over what the server wrote. It returns what unmounts them all. This script is the whole of the page's code in the browser: it imports the islands, and the page's markup, its layout and anything that only made the page (a Markdown parser, a highlighter) are not in it, because nothing the browser runs imports them. That is checked: `tools/server.test.ts` builds a page with an island both ways and looks for the server's code in the browser's bundle.

## What to know

- **The island is replaced, not adopted.** The server's markup is what a reader sees until the script runs, and then the component makes its own and puts it there. So what an island shows when it is first mounted should be what the server wrote, or the page changes under the reader; and an island that a reader has already used (typed in, focused) before the script has run starts again. Scripts of `type="module"` run when the page has been read, which is early. The browser does not take over the server's nodes yet.
- **Props are JSON.** They are written into the marker, so they are what `JSON.parse` makes: a `Date` is a string, and a function cannot be one. They are best small: the marker carries them as an attribute. Data that is large belongs in a script tag (see [Server rendering](server-rendering.md)).
- **An island may use what is around it, with the DOM.** The page's other markup is not the island's, so an island that works on it finds it, as the bar of a live example finds its frame and its code with `closest`, and the contents of this page's right-hand side find the headings. That is ordinary DOM code, in an `Effect`. It works, and it is the place where an island feels the wish to own more of the page than it can: a component that wraps static content is what adopting the server's nodes would make possible.
- **One broken island leaves the others alone.** An island that throws, or that has no component of its name, is reported with `console.error`, and the rest of the page is mounted.
- **In the browser alone, `Island` is only the component.** An app that does not use a server renders the same page and gets the same islands, with no markers.
- **The server needs the usual setup.** `Island` is written for the server's build of `pipis` (the `pipis-server` condition: see [Server rendering](server-rendering.md)), where it writes the marker; in the browser's build it is the component. `mountIslands` is the browser's and has no part of the server in it.

## What it costs

`mountIslands` is about 260 bytes gzipped, with nothing of the server. The islands are what they are. For the pages of this site that is a script of 3.4 KB gzipped for the whole page's behaviour, with pipis in it: the theme, the menu, the search button, the copy buttons, the examples' bars and the contents. The editor (about 55 KB gzipped, with the compiler) and the search dialog (1.7 KB) are loaded when they are first used.
