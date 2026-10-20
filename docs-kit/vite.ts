// The documentation kit as a Vite plugin: the Markdown of a folder becomes the pages of a site, and Vite does what it does for any app: it serves
// the site in development and builds it for production. The kit adds what Vite does not know about a documentation site:
//
//  - the pages: one for each Markdown file, rendered by the app's own server entry (`options.server`, which exports `render(page, assets)`),
//    on demand in development and written as files by the build. The app's browser entry (`options.client`) is the page's script;
//  - modules that are only for the server (`*.server.tsx`), which are what a page is made of that its script is never sent: in the browser's
//    build they are replaced by a stub that has the same names, so what they import (the Markdown reader, the highlighter) is not in it;
//  - the live examples' frames (docs-kit/frames.ts), the search index (Pagefind), and a second app beside the pages (the demos) that has a
//    build of its own, because a demo is an app and the page's script is the documentation's: they are not the same build of the library.
//
// The two sides of the library are the bundler's to choose, and Vite's environments are how: the browser's (`client`) and the server's (`ssr`)
// are given the conditions that make the library the build of each (`options.conditions`).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild, createServer, type InlineConfig, type Plugin, type ViteDevServer } from 'vite-plus';
import { frameFiles, type FrameOptions } from './frames.ts';
import { stripToJs } from '../tools/strip-types.ts';
import { assetLinks } from './handler.ts';
import { loadPages, pagesData, type AssetFiles, type Assets, type PageModel, type PagesOptions } from './pages.ts';
import { writeSearchIndex } from './search.ts';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** What an app's server entry exports: the whole document of a page, as HTML. */
export type Render = (page: PageModel, assets: Assets) => string;

export interface DocsOptions extends Omit<PagesOptions, 'root'> {
  /** The library, as modules the examples can import: the import map's specifiers and the files they are served from. Made when it is needed. */
  library: () => FrameOptions['library'];
  /** A module with `mount(module, container): () => void`, which runs an example's default export in the frame. */
  adapter: string;
  /** CSS beyond the kit's own, in order. */
  styles: string[];
  /** The server's entry, which exports `render`. It is built for the server, and is where the Markdown and what only the server has are used. */
  server: string;
  /** The page's script. It is built for the browser, with the style sheets, and is loaded by every page. */
  client: string;
  /** The conditions that each side's bundler is given, which is how the library is told which side it is on. */
  conditions: { client: string[]; server: string[] };
  /** Exact module names to files, for the libraries that are not installed (the one being documented). */
  alias?: Record<string, string>;
  /** Constants for the page's script, by name (`{ __MODE__: '"hydrate"' }`). */
  define?: Record<string, string>;
  /**
   * The modules that are only for the server, and what each is in the browser's build: `files` says which (it is tested against the module's path,
   * with `/` for separators), and `stub` is the source of a module that exports each of `names`.
   */
  serverOnly: { files: RegExp; stub: (names: string[]) => string };
  /** A second app that is part of the site (the demos), built and served beside the pages, with a configuration of its own. */
  app?: { html: string; folder: string; config: InlineConfig };
  /**
   * Whether each Markdown file is a page of its own (the default), or the site is a single page with all of them on it, in the order of the
   * navigation. A single page is rendered once, from the index page's model with the others in its `merged`, and what it links to is on it, so
   * it needs no search index: the browser's own find is the search.
   */
  pages?: 'separate' | 'single';
  /**
   * What the build leaves: `static` (the default) writes every page as a file, and the result is files only, for any host that serves files; the
   * server's entry is built to do it and is thrown away. `server` leaves the pages to be rendered when they are asked for: the build writes
   * the scripts, the frames, the demos and the search index as files (in the output folder), and the server's entry, bundled with what it uses,
   * beside the data it needs and a middleware (`handler.js`, from docs-kit/handler.ts) for a Node server to render the pages with. See the
   * recipe for Express in docs/authoring.md.
   */
  build?: 'static' | 'server';
  /** Where `build: 'server'` writes the server (default: the output folder's name with `-server`, beside it). It is not for a host to serve as files. */
  serverOutDir?: string;
}

/** Where the files that Vite does not know are put in the site, and the names of the two virtual modules. */
const ENTRY = 'virtual:docs-client';
const STYLES = 'virtual:docs/styles.css';
const SITE = 'virtual:docs/site';
const STUB = '\0docs-server-only:';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** The names a module exports (not its types), for the stub that stands in for it. */
export function exportNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm))
    names.add(m[1] ?? '');
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of (m[1] ?? '').split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name && !name.startsWith('type ')) names.add(name);
    }
  }
  names.delete('');
  return [...names];
}

/** The kit's style sheets and the site's, as one: the editor's themes are put under the page's theme, so that the code follows the switch. */
function styleSheet(options: DocsOptions, root: string, watch: (file: string) => void): string {
  const read = (path: string, resolved = false) => {
    const file = resolved ? path : require.resolve(path);
    watch(file);
    return readFileSync(file, 'utf8');
  };
  const themed = (path: string, scope: string) => `${scope}{${read(path)}}\n`;
  const prism = [
    'prism-code-editor/layout.css',
    'prism-code-editor/scrollbar.css',
    'prism-code-editor/code-block.css',
    'prism-code-editor/guides.css',
  ];
  return [
    ...prism.map((p) => read(p)),
    themed('prism-code-editor/themes/github-light.css', ':root'),
    themed('prism-code-editor/themes/github-dark.css', ':root[data-theme=dark]'),
    read(join(here, 'kit.css'), true),
    ...options.styles.map((s) => read(join(root, s), true)),
  ].join('\n');
}

/** The script and the style sheets that a built page links to, from Vite's manifest of the browser's build. */
function assetsOf(manifest: Record<string, { file: string; css?: string[]; imports?: string[]; isEntry?: boolean }>): AssetFiles {
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
  if (!entry) throw new Error("The browser's build has no entry");
  const styles = new Set<string>();
  const seen = new Set<string>();
  const visit = (chunk: { css?: string[]; imports?: string[] }) => {
    for (const css of chunk.css ?? []) styles.add(css);
    for (const name of chunk.imports ?? []) {
      const next = manifest[name];
      if (next && !seen.has(name)) {
        seen.add(name);
        visit(next);
      }
    }
  };
  visit(entry);
  const fonts = Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith('.woff2'));
  return { script: entry.file, styles: [...styles], fonts };
}

const write = (file: string, content: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

export function docsKit(options: DocsOptions): Plugin {
  let root = '';
  let outDir = '';
  // The server's entry is built to a place of its own: out of the way if the pages are written as files, and to be deployed if they are not.
  let ssrDir = '';
  const alias = () =>
    Object.entries(options.alias ?? {}).map(([find, replacement]) => ({
      find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`),
      replacement,
    }));
  const pagesOptions = (): PagesOptions => ({ ...options, root, single: options.pages === 'single' });
  let styleWatch: string[] = [];

  return {
    name: 'docs-kit',
    enforce: 'pre',

    config(_user, env) {
      // Vitest runs a Vite of its own over this configuration for every test run, and the tests need the library as it is by default.
      if (env.mode === 'test') return undefined;
      const server = options.build === 'server';
      const common = {
        resolve: { conditions: options.conditions.client, alias: alias() },
        // A server that is deployed has what it imports in it. (Node's own modules are still Node's.)
        ssr: {
          resolve: { conditions: options.conditions.server },
          ...(server && env.command === 'build' ? { noExternal: true as const } : {}),
        },
        define: options.define ?? {},
      };
      if (env.command === 'serve') {
        return {
          ...common,
          appType: 'custom' as const,
          // Only the page's script is scanned for what to prepare, and not every page that a build has written under the root.
          optimizeDeps: { entries: [resolve(options.client)] },
          server: { watch: { ignored: ['**/out/**', '**/dist/**'] } },
        };
      }
      const from = _user.root ?? process.cwd();
      const outFolder = resolve(from, _user.build?.outDir ?? 'dist');
      ssrDir = options.serverOutDir ? resolve(options.serverOutDir) : server ? `${outFolder}-server` : join(from, 'out', 'docs-ssr');
      return {
        ...common,
        base: './',
        builder: {},
        environments: {
          client: { build: { manifest: true, modulePreload: false, rollupOptions: { input: { page: ENTRY } } } },
          ssr: {
            build: { outDir: ssrDir, emptyOutDir: true, minify: false, rollupOptions: { input: { server: resolve(options.server) } } },
          },
        },
      };
    },

    configResolved(config) {
      root = config.root;
      outDir = resolve(root, config.environments.client?.build.outDir ?? config.build.outDir);
    },

    // The virtual modules: the page's script (the app's entry and the style sheet), the style sheet, and the site's name and address. A module that is only for the
    // server is not the browser's: what it imports is not in the browser's graph, nor in what Vite scans.
    async resolveId(source, importer, opts) {
      // A virtual module is asked for by name when it is imported, and by its resolved name when a browser asks for it (the style sheet, in a link).
      const [named = '', query] = (source.startsWith('\0') ? source.slice(1) : source).split('?');
      if (named === ENTRY || named === STYLES || named === SITE) return `\0${named}${query === undefined ? '' : `?${query}`}`;
      // The page's script does something when it runs, and is imported for that alone: a package that says its modules have no side effects does
      // not say it of this one.
      if (importer === `\0${ENTRY}` && source === resolve(root, options.client).split(sep).join('/')) {
        const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true });
        return resolved && { ...resolved, moduleSideEffects: true };
      }
      if (this.environment?.config.consumer === 'client') {
        const resolved = await this.resolve(source, importer, { ...opts, skipSelf: true });
        if (resolved && !resolved.external && options.serverOnly.files.test(resolved.id.split(sep).join('/'))) return STUB + resolved.id;
      }
      return undefined;
    },
    async load(requested) {
      // The style sheet is asked for with a query when it is linked (Vite's `direct`, which is the CSS and not a module that adds it).
      const id = requested.split('?')[0] ?? requested;
      if (id === `\0${ENTRY}`) {
        return `import ${JSON.stringify(STYLES)};\nimport ${JSON.stringify(resolve(root, options.client).split(sep).join('/'))};\n`;
      }
      if (id === `\0${SITE}`) {
        return `export const siteTitle = ${JSON.stringify(options.siteTitle)};\nexport const repoHome = ${JSON.stringify(options.repoHome)};\n`;
      }
      if (id === `\0${STYLES}`) {
        styleWatch = [];
        const css = styleSheet(options, root, (file) => styleWatch.push(file));
        for (const file of styleWatch) this.addWatchFile(file);
        return css;
      }
      if (id.startsWith(STUB)) {
        const names = exportNames(readFileSync(id.slice(STUB.length), 'utf8'));
        return options.serverOnly.stub(names);
      }
      return undefined;
    },
    configureServer(server) {
      // Vitest runs a Vite server of its own over this same configuration, for every test run: that one is not for looking at.
      if (server.config.plugins.some((p) => p.name.startsWith('vitest'))) return;
      serveSite(server);
    },

    buildApp: {
      order: 'post',
      async handler(builder) {
        const client = builder.environments.client;
        const server = builder.environments.ssr;
        if (!client || !server) throw new Error('The documentation needs the browser and the server environments');
        await builder.build(client);
        await builder.build(server);
        await finish();
      },
    },
  };

  /** What is written beside Vite's own output: the pages, the frames, the second app, the search index. */
  async function finish() {
    const manifestFile = join(outDir, '.vite', 'manifest.json');
    const assets = assetsOf(JSON.parse(readFileSync(manifestFile, 'utf8')));
    rmSync(join(outDir, '.vite'), { recursive: true, force: true });
    const { render }: { render: Render } = await import(`${pathToFileURL(join(ssrDir, 'server.js')).href}?t=${Date.now()}`);
    const { pages, examples } = loadPages(pagesOptions());
    /** The pages as files, in `into`. */
    const writePages = (into: string) => {
      for (const page of pages) {
        const html = render(page, assetLinks(assets, page.root));
        write(join(into, page.url), `<!doctype html>\n${html}\n`);
      }
    };
    if (options.build === 'server') {
      // What a server needs to render the pages: the pages, where the browser's files are, and the middleware that does it.
      write(join(ssrDir, 'pages.json'), JSON.stringify(pagesData(pages, options.pages === 'single')));
      write(join(ssrDir, 'assets.json'), JSON.stringify(assets));
      write(join(ssrDir, 'handler.js'), stripToJs(readFileSync(join(here, 'handler.ts'), 'utf8')));
    } else {
      writePages(outDir);
    }
    for (const [name, content] of Object.entries(await frameFiles(frameOptions(), examples))) write(join(outDir, 'assets', name), content);
    if (options.app) {
      await viteBuild({
        ...options.app.config,
        configFile: false,
        root,
        base: './',
        logLevel: 'warn',
        build: {
          outDir: join(outDir, options.app.folder),
          emptyOutDir: true,
          assetsDir: 'demo-assets',
          modulePreload: false,
          rollupOptions: { input: { 'demo-app': options.app.html } },
        },
      });
    }
    if (options.pages === 'single') return;
    if (options.build !== 'server') {
      await writeSearchIndex(outDir);
      return;
    }
    // The search reads pages as files, and the server does not have them: they are written for it to read and thrown away, and its index stays.
    const scratch = join(root, 'out', 'docs-search');
    rmSync(scratch, { recursive: true, force: true });
    writePages(scratch);
    await writeSearchIndex(scratch);
    cpSync(join(scratch, 'pagefind'), join(outDir, 'pagefind'), { recursive: true });
    rmSync(scratch, { recursive: true, force: true });
  }

  function frameOptions(): FrameOptions {
    return { root, jsxImportSource: options.jsxImportSource, library: options.library(), adapter: options.adapter };
  }

  /** The development server: pages rendered when they are asked for, by the app's server entry, and the rest as Vite serves any app. */
  function serveSite(server: ViteDevServer) {
    let loaded: ReturnType<typeof loadPages> | undefined;
    let frames: Promise<Record<string, string>> | undefined;
    const log = server.config.logger;

    const pages = () => (loaded ??= loadPages(pagesOptions()));
    const frame = () => (frames ??= frameFiles(frameOptions(), pages().examples));

    // The Markdown, the kit and the library are what the pages and the frames are made of: a change to one is a reload.
    const watched = ['docs', 'docs-kit', 'site', 'src/pipis'].map((d) => join(root, d));
    server.watcher.add(watched);
    server.watcher.on('all', (_event, file) => {
      const path = relative(root, file).split(sep).join('/');
      if (!watched.some((d) => normalize(file).startsWith(d + sep)) || /\.test\.tsx?$/.test(path)) return;
      loaded = undefined;
      frames = undefined;
      if (path.startsWith('docs/')) server.ws.send({ type: 'full-reload', path: '*' });
    });

    if (options.app) {
      const app = options.app;
      const nested = createServer({
        ...app.config,
        configFile: false,
        root,
        base: `/${app.folder}/`,
        appType: 'mpa',
        optimizeDeps: { entries: [app.html] },
        logLevel: 'warn',
        server: { middlewareMode: true, hmr: false },
      });
      nested
        .then((demo) => {
          server.middlewares.use((req, res, next) => {
            if (req.url?.startsWith(`/${app.folder}/`)) demo.middlewares(req, res, next);
            else next();
          });
          server.httpServer?.once('close', () => void demo.close());
        })
        .catch((error: unknown) => log.error(`the ${app.folder} app did not start: ${String(error)}`, { timestamp: true }));
    }

    server.middlewares.use((req, res, next) => {
      const handle = async () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = decodeURIComponent(url.pathname);
        if (path.startsWith('/assets/')) {
          const files = await frame();
          const file = files[path.slice('/assets/'.length)];
          if (file === undefined) return next();
          res.statusCode = 200;
          res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
          res.end(file);
          return;
        }
        if (!path.endsWith('/') && !path.endsWith('.html')) return next();
        const wanted = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
        const page = pages().pages.find((p) => p.url === wanted);
        if (!page) return next();
        const mod = await server.ssrLoadModule(resolve(root, options.server));
        const render: Render = mod.render;
        // The style sheet is linked as well as imported by the script, so that the page is styled when it is first painted and not when the script runs.
        const html = render(page, { script: `/@id/__x00__${ENTRY}`, styles: [`/@id/__x00__${STYLES}`], fonts: [] });
        res.statusCode = 200;
        res.setHeader('content-type', TYPES['.html'] ?? 'text/html');
        res.end(await server.transformIndexHtml(req.url ?? path, `<!doctype html>\n${html}\n`));
      };
      handle().catch((error) => {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        log.error(`the page did not render:\n${message}`, { timestamp: true });
        next(error);
      });
    });
  }
}
