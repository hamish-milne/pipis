// The documentation site, built: the Markdown of a folder as static pages, each example as a module for its iframe, and the few scripts
// the pages use. It knows nothing about the library being documented; the library, its mount adapter and the page layout are given.
// The output is only files, with relative links, so it can be put under any path of any host.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import * as pagefind from 'pagefind';
import { markdownFiles, type DocBlock } from '../tools/docs.ts';
import { escapeHtml } from './code.ts';
import { render, relativeUrl, pageUrl, type Heading, type RenderContext } from './markdown.ts';
import { parseNav, type NavItem, type NavSection } from './nav.ts';
import { toJs } from './transform.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** What a layout is given to make a page. */
export interface PageModel {
  title: string;
  /** This page, relative to the site: `guide/lifecycle.html`. */
  url: string;
  /** The way from this page to the site's root: `../`. */
  root: string;
  /** The page's content. */
  html: string;
  headings: Heading[];
  nav: NavSection[];
  /** This page's place in the navigation, if it has one. */
  current: NavItem | undefined;
  previous: NavItem | undefined;
  next: NavItem | undefined;
  siteTitle: string;
  /** The repository's address on its host. */
  repoHome: string;
  /** A link from this page to another page of the site. */
  href(url: string): string;
}

export interface SiteOptions {
  /** The repository, which the paths below are relative to. */
  root: string;
  /** The folder of Markdown, and the `README.md` in it that orders the site. */
  docs: string;
  /** Where the site is written. Emptied first. */
  out: string;
  siteTitle: string;
  /** The repository's page on its host. */
  repoHome: string;
  /** The address of the repository's files, for links from the docs to a file outside them. */
  repoUrl: string;
  /** What JSX compiles to calls of, for the examples: `pipis`. */
  jsxImportSource: string;
  /** The library, as modules the examples can import: the import map's specifiers and the files they are served from. */
  library: { files: Record<string, string>; imports: Record<string, string> };
  /** A module with `mount(module, container): () => void`, which runs an example's default export in the frame. */
  adapter: string;
  /** The layout of a page: its body as HTML. */
  layout(page: PageModel): string;
  /** CSS beyond the kit's own, in order. */
  styles: string[];
  directives?: RenderContext['directives'];
  /** Empty the output folder first (the default). Not when something else has written there, as Vite has the demos. */
  clean?: boolean;
}

export interface Built {
  pages: string[];
  examples: string[];
}

const THEME_SCRIPT =
  "<script>(function(){var t;try{t=localStorage.getItem('docs-theme')}catch(e){}" +
  "if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" +
  'document.documentElement.dataset.theme=t})()</script>';

function write(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** The example as HTML: its frame, its code, and the places the page's script puts the buttons and a problem. */
function figure(block: DocBlock, code: string, root: string): string {
  const style = [`height:${block.height ?? 120}px`, block.width ? `max-width:${block.width}px` : ''].filter(Boolean).join(';');
  const title = escapeHtml(block.title);
  return (
    `<figure class="example" id="example-${block.id}"${block.height === null ? '' : ` data-height="${block.height}"`}>` +
    `<figcaption><span>${title}</span><span class="example-actions">` +
    '<button type="button" data-action="edit" hidden>Edit</button><button type="button" data-action="reset" hidden>Reset</button></span></figcaption>' +
    `<div class="example-preview" data-pagefind-ignore><iframe loading="lazy" title="${title}" src="${root}assets/frame.html#${block.id}" style="${style}"></iframe></div>` +
    `<div class="example-code">${code}</div><p class="example-error" role="alert" hidden></p>` +
    `<template data-pagefind-ignore>${escapeHtml(block.code)}</template></figure>\n`
  );
}

function descriptionOf(html: string): string {
  const p = /<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
  return p
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function css(options: SiteOptions): string {
  const file = (path: string) => readFileSync(require.resolve(path), 'utf8');
  // The editor's themes style `.prism-code-editor`; each is put under the page's theme, so the code follows the switch.
  const themed = (path: string, scope: string) => `${scope}{${file(path)}}\n`;
  const prism = [
    'prism-code-editor/layout.css',
    'prism-code-editor/scrollbar.css',
    'prism-code-editor/code-block.css',
    'prism-code-editor/guides.css',
  ];
  return [
    ...prism.map(file),
    themed('prism-code-editor/themes/github-light.css', ':root'),
    themed('prism-code-editor/themes/github-dark.css', ':root[data-theme=dark]'),
    readFileSync(join(here, 'kit.css'), 'utf8'),
    ...options.styles.map((s) => readFileSync(join(options.root, s), 'utf8')),
  ].join('\n');
}

/** The scripts: the page's, the frame's, the adapter, and the chunks the page loads when asked (the editor, the search). */
async function scripts(options: SiteOptions, assets: string) {
  const specifiers = [...Object.keys(options.library.imports), 'docs-adapter'];
  const build = await rolldown({
    input: {
      page: join(here, 'client/page.ts'),
      frame: join(here, 'client/frame.ts'),
      adapter: join(options.root, options.adapter),
    },
    platform: 'browser',
    logLevel: 'warn',
    external: specifiers,
    transform: { target: 'es2022' },
  });
  try {
    await build.write({ dir: assets, format: 'esm', minify: true, entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' });
  } finally {
    await build.close();
  }
}

function frame(options: SiteOptions): string {
  const imports = { ...options.library.imports, 'docs-adapter': './adapter.js' };
  // The library's specifiers are served from `lib/`; the map is relative to this file.
  const resolved = Object.fromEntries(Object.entries(imports).map(([k, v]) => [k, v.startsWith('./') ? v : `./${v}`]));
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>Example</title>${THEME_SCRIPT}` +
    `<script type="importmap">${JSON.stringify({ imports: resolved })}</script>` +
    '<link rel="stylesheet" href="frame.css"></head><body><div id="root"></div><script type="module" src="frame.js"></script></body></html>\n'
  );
}

export async function buildSite(options: SiteOptions): Promise<Built> {
  const docs = join(options.root, options.docs);
  const out = resolve(options.root, options.out);
  if (options.clean !== false) rmSync(out, { recursive: true, force: true });
  const assets = join(out, 'assets');
  mkdirSync(assets, { recursive: true });

  const nav = parseNav(readFileSync(join(docs, 'README.md'), 'utf8'));
  const order = nav.flatMap((s) => s.items);
  const pages: string[] = [];
  const examples: string[] = [];

  for (const path of markdownFiles(docs)) {
    const file = relative(docs, path).replace(/\\/g, '/');
    const url = pageUrl(file);
    const root = posix.relative(posix.dirname(url), '.') === '' ? './' : `${posix.relative(posix.dirname(url), '.')}/`;
    const rendered = render(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), {
      file,
      repoUrl: options.repoUrl,
      root,
      example: (block, code) => figure(block, code, root),
      directives: options.directives ?? {},
    });
    for (const block of rendered.examples) {
      write(join(assets, 'examples', `${block.id}.js`), toJs(block.code, options.jsxImportSource));
      examples.push(block.id);
    }
    const at = order.findIndex((item) => item.file === file);
    const page: PageModel = {
      title: rendered.title || file,
      url,
      root,
      siteTitle: options.siteTitle,
      repoHome: options.repoHome,
      html: rendered.html,
      headings: rendered.headings,
      nav,
      current: order[at],
      previous: at > 0 ? order[at - 1] : undefined,
      next: at >= 0 ? order[at + 1] : undefined,
      href: (target) => relativeUrl(url, target),
    };
    const title = `${page.title} · ${options.siteTitle}`;
    write(
      join(out, url),
      '<!doctype html>\n' +
        `<html lang="en" data-root="${root}" data-jsx="${options.jsxImportSource}"><head><meta charset="utf-8">` +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(descriptionOf(rendered.html))}">` +
        `${THEME_SCRIPT}<link rel="stylesheet" href="${root}assets/site.css"></head>` +
        `<body>${options.layout(page)}<script type="module" src="${root}assets/page.js"></script></body></html>\n`,
    );
    pages.push(url);
  }

  for (const [name, content] of Object.entries(options.library.files)) write(join(assets, name), content);
  write(join(assets, 'frame.html'), frame(options));
  write(join(assets, 'site.css'), css(options));
  write(join(assets, 'frame.css'), readFileSync(join(here, 'frame.css'), 'utf8'));
  await scripts(options, assets);
  await index(out);
  return { pages, examples };
}

/** The search index, from the pages as written. Only the text inside `data-pagefind-body` is read, so the frames and chrome are not. */
async function index(out: string) {
  const { index: created } = await pagefind.createIndex({});
  if (!created) throw new Error('Pagefind could not make an index');
  const added = await created.addDirectory({ path: out });
  if (added.errors.length) throw new Error(added.errors.join('\n'));
  const written = await created.writeFiles({ outputPath: join(out, 'pagefind') });
  if (written.errors.length) throw new Error(written.errors.join('\n'));
  await pagefind.close();
  // Pagefind also writes a search box of its own and a highlighter; the site has its own search, and these are not loaded by it.
  for (const name of readdirSync(join(out, 'pagefind'))) {
    if (/^pagefind-(?:component-|modular-)?(?:ui|highlight)/.test(name)) rmSync(join(out, 'pagefind', name));
  }
}
