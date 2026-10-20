# @pipis/docs-kit

> **Beta.** The options may still change between `0.x` releases.

A documentation site from a folder of Markdown, as a [Vite](https://vite.dev) plugin. It is made for [pipis](https://github.com/neofox-solutions/pipis) but knows nothing of it: the library it documents is an option.

- **Live, editable examples.** A fenced `tsx live` block runs in a frame of its own, next to its code; **Edit** turns the code into an editor and re-runs the example as it is typed.
- **Search** over every page (built with Pagefind), with filters by section and topic.
- **The site is your app.** The page is rendered by an entry module of yours, so the layout, components and styles are yours. The kit does the Markdown, navigation, frames, editor, search and the build.
- **Static or served.** The build writes every page as a file, or leaves a middleware (`(request, response, next)`) that renders them when asked, for Express and the like.
- **Hydrated, or islands only.** One page per Markdown file, or one page with everything on it.

## Install

```sh
npm install --save-dev @pipis/docs-kit
```

It needs Vite 8 or later and Node 24 or later.

## Use

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { docsKit } from '@pipis/docs-kit';

export default defineConfig({
  plugins: [
    docsKit({
      docs: 'docs', // the folder of Markdown
      siteTitle: 'My library',
      jsxImportSource: 'my-library',
      server: 'src/server.tsx', // exports `render(page, assets)`: the page, as HTML
      client: 'src/client.ts', // the page's script
      adapter: 'src/adapter.ts', // mounts an example's default export in its frame
      styles: ['src/site.css'],
      library: () => ({ files: {}, imports: {} }), // your library, as modules the examples can import
      conditions: { client: [], server: [] },
      serverOnly: { files: /\.server\.tsx?$/, stub: (names) => names.map((n) => `export const ${n} = () => null;`).join('\n') },
      build: 'static', // or 'server'
      pages: 'separate', // or 'single'
    }),
  ],
});
```

`vite dev` serves the pages, rendered as they are asked for; `vite build` writes the site. The options are documented in `DocsOptions` (`dist/vite.d.ts`), and the working example is the pipis documentation itself: [`apps/docs`](https://github.com/neofox-solutions/pipis/tree/main/apps/docs). The Markdown conventions (the info string of a live block, front matter, serving from a server) are in [Writing documentation](https://github.com/neofox-solutions/pipis/blob/main/docs/authoring.md).

## Licence

MIT
