---
description: How a code block becomes a live example, how this documentation site is built, and what is checked on every change.
tags: [docs, tooling]
---
# Writing documentation

This page is for people who write the docs. It describes the one convention that matters: how a code block becomes a **live example**, and what is checked on every change.

## Live examples

A fenced code block whose info string says `live` is an example that a documentation site shows _running_, next to its code. To a reader of the plain Markdown it is an ordinary TSX code block.

````md
```tsx live title="A counter"
import { reactive } from 'pipis';

export default function Counter() {
  const count = reactive(0);
  return <button onclick={() => (count.value = count.value + 1)}>Clicked {count} times</button>;
}
```
````

### The info string

`tsx live title="..."` followed by any of these, in any order:

| Word         | Meaning                                                                                                                                                                                        | Default             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `live`       | Compile, run and show this block.                                                                                                                                                              |                     |
| `check`      | Compile this block against the library (so it cannot go stale), but show it as plain code. For snippets that are complete modules but not a component on their own. Use instead of `live`.    |                     |
| `title="..."` | A short name. Required. The docs site shows it as the caption (of a block that is only checked, as the name of the file above its code), and the id comes from it.                                                                                                      |                     |
| `id=...`     | A stable id, when the title is not unique or may change.                                                                                                                                       | the title, kebab-cased |
| `height=N`   | The preview's height in pixels.                                                                                                                                                                | fits its content    |
| `width=N`    | A fixed preview width in pixels.                                                                                                                                                               | fills the page      |
| `static`     | The example needs no pointer or keyboard, so a site may show it as a picture.                                                                                                                  |                     |

Anything else in the info string is an error. Plain blocks (`ts`, `bash`, `html`, ...) have no docs words: use them for declarations, signatures, configuration and output, never for code a reader would paste into a module.

### The module

The code of a `live` block is a complete **ES module**, as a reader would write it in their own project:

- It imports from `'pipis'` only. Nothing else is available, so a docs site only has to provide the library.
- Its **default export is a function with no parameters that returns an element**: a component. The site calls it and mounts the result into a container it provides. The site, not the example, decides where it goes and how big it is.
- It is **self-contained and deterministic**: no network, no `Math.random()`, no `Date.now()`. Data is written out, or computed by a small function in the block. A promise is made from `setTimeout`, not from `fetch`.
- It contains only what the reader needs. Every import is used; the compiler runs with `noUnusedLocals`.
- Names are the library's own. Do not rename imports.

A `check` block is a module too, but it may import other packages that the repository has installed (the state libraries in the cookbook, for example), and it need not have a default export.

### What is checked

`pnpm vp run docs` (part of `pnpm vp run all`) does this for every `live` and `check` block in `docs/`:

1. Writes it to its own file and runs the TypeScript compiler over all of them, with the project's strict settings and `jsxImportSource: pipis`. A mistake is reported as the Markdown file and line.
2. For `live` blocks: bundles it, calls the default export, mounts the result in a DOM, and checks that something was rendered, that nothing shows `NaN`, `undefined` or `[object Object]`, and that it unmounts cleanly.
3. Checks that every relative link and heading anchor in the documentation goes somewhere.
4. Checks that `docs/reference/api.md` is what `node tools/api.ts` prints, and that every export of the package is documented and placed.
5. Checks that every `tsx` example in [`LLM.md`](../LLM.md) is one of the compiled ones in `src/types/llm.check.tsx`.

`PIPIS_DOCS_SHEET=1 pnpm vp run docs` also writes `out/docs-sheet.html`: the HTML of every live example on one page, for looking at.

### The site

`pnpm vp dev` serves the documentation, and rebuilds and reloads the browser when a page, the site or the library changes (a change to a demo app in `src/samples/` hot-reloads, as in any Vite app). `pnpm vp run build` writes it into `dist/`, and `node site/serve.ts` serves that folder (the example frames and the search need an HTTP address, not a `file://` one). The pages are this Markdown; their order is the order of the links in [README.md](README.md), so a new page is added there. The output is plain files with relative links: put the folder under any path of any host.

What a page gets from the Markdown:

- A `live` block is shown as a running example above its code, in an `iframe` of its own, so an example cannot disturb the page and the page cannot disturb it. The frame loads when it is near the screen. **Edit** turns the code into an editor and re-runs the example as it is typed; **Reset** puts it back. An error in the code is shown under the editor and the last version that ran stays on show. The editor and the compiler are downloaded only when Edit is first used.
- Editing compiles the code in the browser with [Sucrase](https://github.com/alangpierce/sucrase), which takes out the types and compiles the JSX but does not check types. The type check is the job of `pnpm vp run docs`, so an edited example can be wrong in ways the editor does not say.
- `height=N` fixes the height of the frame; without it the frame follows the height of its content.
- A block whose language is `demo` names a demo app of `src/samples/` (its body is the file name without the extension: `todo`). The site shows the app in a frame with its source below. To GitHub it is a plain block that names the demo.
- A heading has the anchor that GitHub gives it, and a link to another `.md` file becomes a link to its page. A link to a file outside `docs/` (such as `../LLM.md`) goes to that file in the repository.
- The search reads the text of each page. **Ctrl+K** (or **⌘K**) opens it. Pages are tagged for it, so that a reader can narrow a search by where a page is and by what it is about, or choose a topic and see its pages with nothing typed (see Front matter below).

### Front matter

A page may begin with front matter: a few lines between `---` fences that say what the search and the page's head should know about it. GitHub shows it as a table above the page, so the page reads on both.

```md
---
description: What the page is for, in a sentence.
tags: [reactivity, state]
---
# The page
```

| Key           | Meaning                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `description` | What the page is for. It is the page's `<meta name="description">` and what the search shows under a topic. Without it, the first paragraph is used. Do not put a link in it.        |
| `tags`        | The topics of the page, a list in brackets. Each is one of the words in `site/tags.ts`: a page with another is an error when the site is built, so a tag is a decision, not a typo. |
| `section`     | The part of the docs the page is in. Without it, the section of the navigation that lists the page, or of a page in its folder (so the design decisions are in Reference).        |

Anything else, a key twice, or a line that is not `key: value` is an error that names the line. The search's filters are made from these: a section is one choice and topics add up, with how many pages each leaves.

The site is split in two. `docs-kit/` is the engine, a Vite plugin: it reads Markdown into tokens, and knows pages, navigation, frames, the editor, the search and how a page is built and served, and nothing of pipis. `site/` is this site, written as a pipis app, and is the plugin's options (`site/vite-plugin.ts`) and four things: the page as one app (`site/app.tsx`: the header, the navigation, the article, the contents), what only the server makes of it (`site/docs.server.tsx`, which reads the Markdown and highlights the code, and is a stub in the browser's build, so none of that is in the page's script), the parts that do something, which are islands (`site/controls.tsx`, `site/blocks.tsx`, `site/search.tsx`), and the browser's script (`site/client.ts`). `vp dev` renders a page when it is asked for, and `vp build` writes them all ([Server rendering](guide/server-rendering.md), [Hydration](guide/hydration.md), [Islands](guide/islands.md)); `docsSite({ render, pages })` in `site/vite-plugin.ts` is the site's two choices: `render` is `hydrate` (the page is taken over) or `islands` (only the islands are mounted), and `pages` is `separate` (a page for each Markdown file) or `single` (one page with all of them on it, in the order of the navigation, with the find of the browser for a search); `vp build --config site/islands.config.ts`, `site/single.config.ts` and `site/single-islands.config.ts` build the others. A third, `build`, is whether the build writes the pages as files (`static`) or leaves them for a server to render (`server`): see [Serving the documentation from a server](#serving-the-documentation-from-a-server). The look is plain CSS in `site/site.css` (the design, in variables, with a light and a dark theme) and `docs-kit/kit.css` (code, examples and the search), with Inter and JetBrains Mono self-hosted in `site/fonts.css`. The rest of `site/` is `site/adapter.ts`, the few lines that mount an example's default export in a frame. Another library's docs are the same kit with a different adapter and components. `site/site.test.ts` builds the site under a path of its own and uses it in Chromium: every page is opened, every example run, one edited, the search used, the theme switched, and the same again in islands mode.

### Serving the documentation from a server

By default the build writes every page as a file (`build: 'static'`), and the result is files for any host that serves files. When the documentation is part of an application that has a server, the build can leave the pages to be rendered when they are asked for (`build: 'server'`, in the plugin's options; `site/server.config.ts` is the configuration, and `vp build --config site/server.config.ts` builds it). Both render a page with the same `render` of the site's server entry, so a page from the server is the page that the build of files would have written, byte for byte (a test holds them to it).

The build then writes two folders, which are not served by the same means:

```text
dist/            the browser's files: the scripts and style sheets (named by their contents), the frames of the examples, the demos, the search index
dist-server/     the server's: server.js (with what it imports in it), handler.js, pages.json and assets.json
```

`dist-server/handler.js` is `docs-kit/handler.ts` with its types blanked out. It exports `createHandler(options)`, which returns a middleware, `(request, response, next)`, the form that Express, Connect and `node:http` take. It answers a `GET` or `HEAD` for a page of the site with the page, and calls `next()` for anything else, so the rest of the application is left alone. In Express:

```js
import express from 'express';
import { createHandler } from './dist-server/handler.js';

const app = express();
app.use('/docs', express.static('dist')); // the browser's files
app.use('/docs', await createHandler({ base: '/docs/' })); // the pages
app.get('/', (request, response) => response.send('The application'));
app.listen(3000);
```

The pages link to each other and to their files by relative paths, so they work wherever they are mounted; `base` is only how the middleware knows which addresses are its own. Two more things can be said when it is created, or when the site is built:

| Option                  | Where                          | What it is for                                                                                                                                                   |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`                  | `createHandler`                | The path the site is mounted under (`/docs/`). The default is `/`.                                                                                               |
| `sourceRoot`            | `createHandler`                | Where the files are that a page reads as it is rendered. A demo shows the source of its app from `src/samples`, so those files go where the server runs.        |
| `serverOutDir`          | the plugin's options           | Where the server's folder is written (by default, beside the output folder with `-server` added). It is not for a host to serve as files.                       |

Other frameworks need only the same contract. The middleware has no dependency but Node, and a framework that does not take `(request, response, next)` can call the function it returns with the two Node objects and answer 404 itself when it calls `next`. `site/serve.ts` is the smallest example: it serves the folder of files and falls back to the middleware (`node site/serve.ts dist --server dist-server`), and the tests of the site use it. The search is built from the pages as files and its index is written to the output folder, so the pages that the server renders are found as the pages of a built site are. The development server (`vp dev`) renders on request in the same way, whichever `build` says.

### Everything else on a page

- One `#` heading per page, `##` for sections. A page starts with one paragraph saying what it is for.
- Prefer a short live example near the top of each section, then the options in a table, then the details.
- Link to other pages with relative paths. Name functions, props and attributes in `code`.
- Say what is _not_ supported when a reader would expect it.
- A tip is a block quote beginning `> **Tip.**`, a warning one beginning `> **Note.**`.
- Quote only numbers from `node tools/size.ts` and `node tools/bench.ts` ([ADR 15](adr/0015-size.md)).
- The API reference (`reference/api.md`) is generated: change a doc comment in `src/pipis/` and run `node tools/api.ts --out docs/reference/api.md`. The first sentence of a doc comment must stand on its own.
