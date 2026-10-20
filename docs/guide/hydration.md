---
description: Making a page that a server wrote live in the browser, by taking over its nodes instead of making them again.
tags: [ssr, platform]
---

# Hydration

A page that a server wrote is complete as HTML, but it does nothing until the browser has run the app. **Hydration** is how the app starts on it: the browser's code mounts the app over the page and takes the nodes that the server wrote, instead of making them again, so what the reader sees, has typed or has focused stays where it is, and the page does not flicker.

It is for an app that is rendered on a server and is interactive everywhere. For a page that is mostly static with a few parts that do something, use [Islands](islands.md), which download only those parts.

## Two builds of one app

The app is written once. The server builds it with the `pipis-server` condition and renders markup that can be hydrated; the browser builds it with the `pipis-hydrate` condition ([Server rendering](server-rendering.md) shows how a bundler is told).

```tsx check title="The app" id=app
import { reactive, select } from 'pipis';

export function App() {
  const count = reactive(0);
  return (
    <main>
      <h1>A counter</h1>
      <button onclick={() => count.value++}>{select(count, (n) => `Clicked ${n} times`)}</button>
    </main>
  );
}
```

On the server, ask for markup that can be hydrated:

```tsx check title="The server"
import { renderToString } from 'pipis/server';
import { App } from './app.tsx';

export function page(): string {
  const { html, head } = renderToString(<App />, { hydratable: true });
  return `<!doctype html><html><head>${head}</head><body><div id="app">${html}</div><script type="module" src="./client.js"></script></body></html>`;
}
```

In the browser, hydrate the container:

```tsx check title="The browser"
import { hydrate } from 'pipis/hydrate';
import { App } from './app.tsx';

const container = document.getElementById('app');
if (container) hydrate(container, <App />);
```

`hydrate` is synchronous. When it returns, the page is the app's, made of the server's nodes, and the button works.

## What hydratable markup is

It is the markup of a page that is not hydrated, with comments that mark what a browser cannot see in HTML: `<!--t-->` before each text node (two text nodes next to each other are one when a browser reads them, and an empty one is none), `<!---->` and `<!--/-->` around each region that can change (an `If`, a `List`, a `Dynamic`), and `<!--h-->` and `<!--/h-->` around what `Helmet` wrote for the head. They are small, and a page that is not hydrated does not have them.

## How it finds the nodes

Each element takes the node that is where it is mounted, if it is its tag (text and markers match by kind). It does not compare attributes: the element gives itself its props, so the page is the app's whatever the server wrote. A node that is in the way is removed, a node that is missing is made, and what is left over in a parent when its children are mounted is removed. A form control that someone has changed before the app started keeps what they typed.

## What to know

- **State may be written, but it may not change what a region shows.** A component can set a value as it is made or mounted, and the text and attributes that follow it are right. What is refused is a write that makes an `If`, `OneOf`, `List`, `ReactiveList` or `Dynamic` that is already mounted show something else, because its nodes are being found at that moment: that is an error (which goes to the nearest `ErrorBoundary`, or the console), and the region keeps what the server wrote. Set such state in an `Effect`, which runs when the page is whole, or compute it as a derived value instead.
- **`Effect`, `Watch`, `Portal` and `ref` wait.** They run when the page is whole, in the order they were mounted, so code in them finds the page as a browser would have made it. A `Portal` renders then, so what it holds is not in the server's markup, and is not a mismatch.
- **A mismatch is repaired and reported.** If the server's page has a node the app does not (or the reverse), it is removed (or made), and `hydrate` says so with `console.warn`: a count of each. Pass `onMismatch` to do something else; it is given `{ missing, extraneous }`, and an `error` if the app threw and the page had to be made again from nothing. A mismatch usually means that what the server rendered depended on something the browser has differently (the time, a random number, `window`): make the two the same.
- **The head is replaced.** What the server's `Helmet` wrote is removed and the browser's is made, so a title or a meta tag is the app's, and the rest of the head is left alone.
- **Hydrated pages and plain pages differ only in the markers.** An app built without the `pipis-hydrate` condition mounts as always. `hydrate` says so if it is called in such a build.

## Static content

`Static` is content that never changes, which the browser takes as the server wrote it, without running its children:

```ts check title="What makes the content" id=article-html
export function renderArticle(source: string): string {
  return `<p>${source}</p>`;
}
```

```tsx check title="Static content"
import { Static } from 'pipis/hydrate';
import { renderArticle } from './article-html.ts';

export function Article(props: { source: string }) {
  return <Static>{() => <div innerHTML={renderArticle(props.source)} />}</Static>;
}
```

In a hydrating build the children are not called, so the renderer is not run. To leave the renderer out of the browser's bundle too, import it only where the build is not hydrating (the bundler removes a branch on `IS_HYDRATE`, which is a constant).

## What it costs

The hydrating build adds about 1.3 KB (gzipped) to the browser's code, for the finding of nodes, and nothing to a build without the condition. See the [decision record](../adr/0021-hydration.md) for the reasoning and the tests.
