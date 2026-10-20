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
| `title="..."` | A short name. Required. The docs site shows it as the caption, and the id comes from it.                                                                                                       |                     |
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
- The search reads the text of each page. **Ctrl+K** (or **⌘K**) opens it.

The site is split in two. `docs-kit/` is the engine: it reads Markdown into tokens, and knows pages, navigation, frames, the editor and the search, and nothing of pipis. `site/` is this site, written as a pipis app: a page is the `Document` component, which renders the whole HTML document (the head, the layout and `Markdown`, a component that makes elements from the tokens, with a renderer that gives a heading its anchor, highlights code and makes a `live` block an `Example`). The build renders it to HTML for each page as an app's server would ([Server rendering](guide/server-rendering.md)). The rest of `site/` is its style sheet and `site/adapter.ts`, the few lines that mount an example's default export in a frame. Another library's docs are the same kit with a different adapter and components. `site/site.test.ts` builds the site under a path of its own and uses it in Chromium: every page is opened, every example run, one edited, the search used, the theme switched.

### Everything else on a page

- One `#` heading per page, `##` for sections. A page starts with one paragraph saying what it is for.
- Prefer a short live example near the top of each section, then the options in a table, then the details.
- Link to other pages with relative paths. Name functions, props and attributes in `code`.
- Say what is _not_ supported when a reader would expect it.
- A tip is a block quote beginning `> **Tip.**`, a warning one beginning `> **Note.**`.
- Quote only numbers from `node tools/size.ts` and `node tools/bench.ts` ([ADR 15](adr/0015-size.md)).
- The API reference (`reference/api.md`) is generated: change a doc comment in `src/pipis/` and run `node tools/api.ts --out docs/reference/api.md`. The first sentence of a doc comment must stand on its own.
