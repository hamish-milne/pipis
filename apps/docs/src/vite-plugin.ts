// The documentation site, as a Vite plugin, so that `vp dev` and `vp build` are the site's dev server and build. This is the kit (@pipis/docs-kit)
// given what is particular to this site: the library it documents, the app that makes the pages (src/server.tsx, src/client.ts), the demos, and
// which build of the library each side is.
//
//   vp dev                                    the pages, rendered as they are asked for, with Vite's reloading
//   vp build                                  the site into dist/
//   vp build --config islands.config.ts       the same site with a script that mounts only the islands, and does not hydrate the page
//   vp build --config single.config.ts        the same site as a single page, with all the Markdown on it
//   vp build --config single-islands.config.ts   both
//   vp build --config server.config.ts        the pages are not written: a server renders them (the recipe in docs/authoring.md)
//   node src/serve.ts                         serves what was built, for looking at it
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite-plus';
import { docsKit, moduleFiles } from '@pipis/docs-kit';
import { repoFiles, repoHome, siteTitle } from './config.ts';
import { TAGS } from './tags.ts';

/** This app: its `src/` is where its modules are, and the Markdown it is made of is the repository's, two folders up. */
const root = join(import.meta.dirname, '..');
const here = root.replace(/\\/g, '/');

/** The library's source, found as an app finds a library: by its name. */
const library = join(dirname(createRequire(import.meta.url).resolve('pipis/package.json')), 'src');

/**
 * The library as the examples import it, in a browser: the package's own modules, as `pipis` ships them, with the browser's platform
 * (the package's `#platform` import is what the import map says it is). The server's modules are not in the browser's pages.
 */
function examplesLibrary() {
  const files = moduleFiles(library, /(?:\.test|\.d)\.ts$|^(?:server|reflect|platform\.server)\.ts$/);
  return {
    files,
    imports: {
      pipis: 'lib/index.js',
      'pipis/jsx-runtime': 'lib/jsx-runtime.js',
      'pipis/jsx-dev-runtime': 'lib/jsx-dev-runtime.js',
      '#platform': 'lib/platform.client.js',
    },
  };
}

export interface SiteOptions {
  /** How the page's script makes the page live: `hydrate` takes over the page (the default), and `islands` makes only the islands in it, again. */
  render?: 'hydrate' | 'islands';
  /** Whether each Markdown file is a page of its own (the default), or the site is one page with all of them on it. It works with either way of rendering. */
  pages?: 'separate' | 'single';
  /** What the build leaves: every page as a file (`static`, the default), or the server's code to render them with (`server`, see docs/authoring.md). */
  build?: 'static' | 'server';
}

export function docsSite({ render = 'hydrate', pages = 'separate', build = 'static' }: SiteOptions = {}): Plugin {
  return docsKit({
    docs: '../../docs',
    siteTitle,
    repoHome,
    repoUrl: repoFiles,
    jsxImportSource: 'pipis',
    tags: TAGS,
    library: examplesLibrary,
    watch: [library],
    adapter: 'src/adapter.ts',
    styles: ['src/site.css'],
    server: 'src/server.tsx',
    client: 'src/client.ts',
    // The page is rendered on the server, by the build of pipis that writes markup. In the browser, a page that is hydrated is taken over by the
    // build that adopts; islands that are made again are the ordinary build, which has nothing for adopting in it.
    conditions: { client: render === 'hydrate' ? ['pipis-hydrate'] : [], server: ['pipis-server'] },
    pages,
    build,
    define: { __DOCS_RENDER__: JSON.stringify(render), __DOCS_PAGES__: JSON.stringify(pages) },
    // What a module for the server is in the browser: the page has the same structure, and nothing in it. (The page's markup is what the browser adopts.)
    serverOnly: {
      files: new RegExp(`^${here.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/src/[^/]+\\.server\\.tsx?$`),
      stub: (names) =>
        `import { Static } from 'pipis/hydrate';\n${names.map((name) => `export const ${name} = () => Static({});`).join('\n')}\n`,
    },
    // The demos are apps of the documentation's own, and are built with the library as an app has it (the browser's, with nothing adopted),
    // so they are a build of their own: the page's script has the hydrating one.
    app: { html: 'demo-app.html', folder: 'demo', config: { plugins: [tailwindcss()] } },
  });
}
