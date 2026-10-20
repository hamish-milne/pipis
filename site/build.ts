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
import { highlight, escapeHtml } from '../docs-kit/code.ts';
import { bundle } from '../tools/bundle.ts';
import { LIBRARY } from '../tools/deps.ts';
import { stripToJs } from '../tools/strip-types.ts';
import { repoFiles, repoHome, siteTitle } from './config.ts';
import { installDom, toHtml } from './dom.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name: string) => join(root, 'src/pipis', name);

/** The layout, which is JSX over pipis: bundled, because Node does not read JSX, and run in a DOM. */
async function loadLayout(): Promise<(page: PageModel) => string> {
  const code = await bundle({
    contents: `export { Page } from 'layout';`,
    alias: {
      layout: join(root, 'site/layout.tsx'),
      pipis: src('index.ts'),
      'pipis/jsx-runtime': src('jsx-runtime.ts'),
      'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
    },
    jsxImportSource: 'pipis',
    platform: 'node',
  });
  const file = join(root, 'out', 'site-layout.mjs');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  installDom();
  const { Page }: { Page: (props: { page: PageModel }) => (parent?: Node) => unknown } = await import(pathToFileURL(file).href);
  return (page) => toHtml(Page({ page }));
}

/** The library as the examples import it: the package's own modules, as `pipis` ships them. */
function library(): SiteOptions['library'] {
  const files: Record<string, string> = {};
  for (const module of ['index', ...Object.keys(LIBRARY)]) {
    files[`lib/${module}.js`] = stripToJs(readFileSync(src(`${module}.ts`), 'utf8'));
  }
  return {
    files,
    imports: { pipis: 'lib/index.js', 'pipis/jsx-runtime': 'lib/jsx-runtime.js', 'pipis/jsx-dev-runtime': 'lib/jsx-dev-runtime.js' },
  };
}

/** A demo: the app in a frame, and its source below it. */
function demo(name: string, rootPath: string): string {
  const file = join(root, 'src/samples', `${name}.tsx`);
  const source = readFileSync(file, 'utf8');
  return (
    `<div class="demo" data-pagefind-ignore><iframe loading="lazy" title="${escapeHtml(name)} demo" src="${rootPath}demo-app.html#${name}"></iframe>` +
    `<details><summary>Source: src/samples/${name}.tsx</summary><div class="code">${highlight(source, 'tsx')}</div></details></div>\n`
  );
}

/** Writes the site's pages and scripts into `out`, which is emptied first unless `clean` is false (Vite has put the demos there). */
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
    layout: await loadLayout(),
    styles: ['site/site.css'],
    directives: { demo: (name, ctx) => demo(name, ctx.root) },
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
