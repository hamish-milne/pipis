// Writes the pipis documentation's pages and scripts into dist/ (or the folder after `--out`; `--keep` leaves what is there). This is the
// part of the build that `vp build` and `vp dev` run, through site/vite-plugin.ts; Vite itself builds the demo apps. To use it by hand:
//   node site/build.ts
//   node site/serve.ts      then open the address it prints
// The pages are the Markdown of docs/; the examples run the library's own source, as the package ships it (types blanked); the demos
// are the apps of src/samples. See docs/authoring.md for what a page can contain.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite, type PageModel, type SiteOptions } from '../docs-kit/build.ts';
import { bundle } from '../tools/bundle.ts';
import { LIBRARY } from '../tools/deps.ts';
import { stripToJs } from '../tools/strip-types.ts';
import { repoFiles, repoHome, siteTitle } from './config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name: string) => join(root, 'src/pipis', name);

/**
 * The layout, which is JSX over pipis: bundled, because Node does not read JSX, and built as an app's server is, with pipis as the
 * server's platform (the `pipis-server` condition), so that a page is rendered to a string with no DOM at all.
 */
async function loadLayout(): Promise<(page: PageModel) => string> {
  const code = await bundle({
    contents: `import { renderToString } from 'pipis/server'; import { Document } from 'layout'; export const render = (page) => renderToString(Document({ page })).html;`,
    alias: {
      layout: join(root, 'site/document.tsx'),
      pipis: src('index.ts'),
      'pipis/server': src('server.ts'),
      'pipis/jsx-runtime': src('jsx-runtime.ts'),
      'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
    },
    jsxImportSource: 'pipis',
    platform: 'node',
    conditions: ['pipis-server'],
  });
  const file = join(root, 'out', 'site-layout.mjs');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  const { render }: { render: (page: PageModel) => string } = await import(pathToFileURL(file).href);
  return render;
}

/**
 * The library as the examples import it, in a browser: the package's own modules, as `pipis` ships them, with the browser's platform
 * (the package's `#platform` import is what the import map says it is). The server's modules are not in the browser's pages.
 */
function library(): SiteOptions['library'] {
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

export async function build(out = 'dist', clean = true) {
  const built = await buildSite({
    root,
    docs: 'docs',
    out,
    siteTitle,
    repoHome,
    repoUrl: repoFiles,
    jsxImportSource: 'pipis',
    library: library(),
    adapter: 'site/adapter.ts',
    document: await loadLayout(),
    styles: ['site/site.css'],
    clean,
  });
  return built;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const at = process.argv.indexOf('--out');
  const out = at > 0 ? (process.argv[at + 1] ?? 'dist') : 'dist';
  const built = await build(out, !process.argv.includes('--keep'));
  console.log(`${built.pages.length} pages and ${built.examples.length} live examples written to ${out}/`);
}
