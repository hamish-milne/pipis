// The documentation site, as a Vite plugin, so that `vp dev` and `vp build` are the site's dev server and build. This is the kit (docs-kit/vite.ts)
// given what is particular to this site: the library it documents, the app that makes the pages (site/server.tsx, site/client.ts), the demos, and
// which build of the library each side is.
//
//   vp dev                           the pages, rendered as they are asked for, with Vite's reloading
//   vp build                         the site into dist/
//   vp build --config site/islands.config.ts   the same site with a script that mounts only the islands, and does not hydrate the page
//   vp build --config site/single.config.ts    the same site as a single page, with all the Markdown on it
//   vp build --config site/single-islands.config.ts   both
//   node site/serve.ts               serves what was built, for looking at it
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite-plus';
import { docsKit } from '../docs-kit/vite.ts';
import { LIBRARY } from '../tools/deps.ts';
import { stripToJs } from '../tools/strip-types.ts';
import { repoFiles, repoHome, siteTitle } from './config.ts';
import { TAGS } from './tags.ts';

const root = join(import.meta.dirname, '..');
const src = (name: string) => join(root, 'src/pipis', name);

/**
 * The library as the examples import it, in a browser: the package's own modules, as `pipis` ships them, with the browser's platform
 * (the package's `#platform` import is what the import map says it is). The server's modules are not in the browser's pages.
 */
function library() {
  const files: Record<string, string> = {};
  const server = new Set(['server', 'platform.server', 'reflect']);
  for (const module of ['index', ...Object.keys(LIBRARY)].filter((m) => !server.has(m))) {
    files[`lib/${module}.js`] = stripToJs(readFileSync(src(`${module}.ts`), 'utf8'));
  }
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

/** The library by the names an app imports it by, from the repository's source. */
const alias = {
  pipis: src('index.ts'),
  'pipis/server': src('server.ts'),
  'pipis/islands': src('islands.ts'),
  'pipis/hydrate': src('hydrate.ts'),
  'pipis/jsx-runtime': src('jsx-runtime.ts'),
  'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
};

export interface SiteOptions {
  /** How the page's script makes the page live: `hydrate` takes over the page (the default), and `islands` makes only the islands in it, again. */
  render?: 'hydrate' | 'islands';
  /** Whether each Markdown file is a page of its own (the default), or the site is one page with all of them on it. It works with either way of rendering. */
  pages?: 'separate' | 'single';
}

export function docsSite({ render = 'hydrate', pages = 'separate' }: SiteOptions = {}): Plugin {
  return docsKit({
    docs: 'docs',
    siteTitle,
    repoHome,
    repoUrl: repoFiles,
    jsxImportSource: 'pipis',
    tags: TAGS,
    library,
    adapter: 'site/adapter.ts',
    styles: ['site/site.css'],
    server: 'site/server.tsx',
    client: 'site/client.ts',
    // The page is rendered on the server, by the build of pipis that writes markup. In the browser, a page that is hydrated is taken over by the
    // build that adopts; islands that are made again are the ordinary build, which has nothing for adopting in it.
    conditions: { client: render === 'hydrate' ? ['pipis-hydrate'] : [], server: ['pipis-server'] },
    alias,
    pages,
    define: { __DOCS_RENDER__: JSON.stringify(render), __DOCS_PAGES__: JSON.stringify(pages) },
    // What a module for the server is in the browser: the page has the same structure, and nothing in it. (The page's markup is what the browser adopts.)
    serverOnly: {
      files: /\/site\/[^/]+\.server\.tsx?$/,
      stub: (names) =>
        `import { Static } from 'pipis/hydrate';\n${names.map((name) => `export const ${name} = () => Static({});`).join('\n')}\n`,
    },
    // The demos are apps of the documentation's own, and are built with the library as an app has it (the browser's, with nothing adopted),
    // so they are a build of their own: the page's script has the hydrating one.
    app: { html: 'demo-app.html', folder: 'demo', config: { plugins: [tailwindcss()] } },
  });
}
