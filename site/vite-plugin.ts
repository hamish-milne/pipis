// The documentation site, as a Vite plugin, so that `vp dev` and `vp build` are the site's dev server and build.
//
// The pages are generated (there is no index.html in the repository): `site/build.ts` makes them from docs/ and the kit, and Vite does
// the rest. The demo apps are real Vite entries (`demo-app.html`, with Tailwind), so Vite builds them and serves them with hot reload.
//  - `vp dev`: the pages are built into folders of out/ and served at the root, with Vite's client in them. A change to the docs, the kit, the
//    site or the library rebuilds them and reloads the browser.
//  - `vp build`: Vite builds the demos into dist/, and then the pages are written beside them.
// The build runs in a process of its own each time, so that a change to the build code itself takes effect without a restart, and the
// build's dependencies (jsdom, the highlighter, the search indexer) are not loaded by every `vp` command.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite-plus';
import { TYPES } from './serve.ts';

/** Where a change rebuilds the pages: the content, what makes the pages, and the library that the examples run. */
const WATCHED = ['docs', 'docs-kit', 'site', 'src/pipis'];

/** Files of the site that Vite serves itself (the demo apps), rather than the generated pages. */
const VITE_OWN = /^\/(?:demo-app\.html|demo-assets\/|@|src\/|node_modules\/)/;

function runBuild(root: string, out: string, keep: boolean): Promise<void> {
  return new Promise((done, fail) => {
    execFile(
      process.execPath,
      [join(root, 'site/build.ts'), '--out', out, ...(keep ? ['--keep'] : [])],
      { cwd: root },
      (error, _out, stderr) => {
        if (error) fail(new Error(stderr.trim() || error.message));
        else done();
      },
    );
  });
}

export function docsSite(): Plugin {
  let root = '';
  return {
    name: 'pipis-docs-site',
    configResolved(config) {
      root = config.root;
    },
    config(_, { command }) {
      // There is no index.html to be the entry: the demo app is, and the pages are written beside what is built from it.
      if (command === 'build') {
        return {
          base: './',
          build: {
            assetsDir: 'demo-assets',
            modulePreload: false,
            rollupOptions: { input: { 'demo-app': 'demo-app.html' }, checks: { pluginTimings: false } },
          },
        };
      }
      // What the dev server writes (out/) and what a build writes (dist/) are not source: a change there is not a reason to reload.
      return { server: { watch: { ignored: ['**/out/**', '**/dist/**'] } } };
    },
    configureServer(server) {
      // Vitest runs a Vite server of its own over this same config, for every test run: that one is not for looking at.
      if (server.config.plugins.some((p) => p.name.startsWith('vitest'))) return;
      startDev(server, root);
    },
    // The pages are written after Vite has written the demos.
    writeBundle: {
      order: 'post',
      async handler(options) {
        if (this.environment?.name && this.environment.name !== 'client') return;
        const out = options.dir ? resolve(options.dir) : join(root, 'dist');
        await runBuild(root, out, true);
      },
    },
  };
}

function startDev(server: ViteDevServer, root: string) {
  // Each build is its own folder, and the pages served are those of the last one that worked: a build never changes what is being served.
  let live = '';
  let count = 0;
  // What an earlier run left behind.
  if (existsSync(join(root, 'out'))) {
    for (const name of readdirSync(join(root, 'out')))
      if (name.startsWith('site-dev-')) rmSync(join(root, 'out', name), { recursive: true, force: true });
  }
  const log = server.config.logger;
  let building: Promise<void> | undefined;
  let again = false;

  async function rebuild(): Promise<void> {
    const started = Date.now();
    try {
      const next = join(root, 'out', `site-dev-${++count}`);
      await runBuild(root, next, false);
      const previous = live;
      live = next;
      if (previous) rmSync(previous, { recursive: true, force: true });
      log.info(`pages rebuilt in ${Date.now() - started} ms`, { timestamp: true });
      server.ws.send({ type: 'full-reload', path: '*' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`the pages did not build:\n${message}`, { timestamp: true });
      server.ws.send({ type: 'error', err: { message, stack: '' } });
    }
  }

  /** One build at a time; a change during a build is built once more after it. */
  function schedule(): Promise<void> {
    if (building) {
      again = true;
      return building;
    }
    building = rebuild().finally(() => {
      building = undefined;
      if (again) {
        again = false;
        void schedule();
      }
    });
    return building;
  }

  // The pages are only for as long as the server is.
  server.httpServer?.once('close', () => {
    if (live) rmSync(live, { recursive: true, force: true });
  });

  const ready = schedule();
  const dirs = WATCHED.map((d) => join(root, d));
  server.watcher.add(dirs);
  server.watcher.on('all', (_event, file) => {
    const path = relative(root, file).split(sep).join('/');
    if (WATCHED.some((d) => path.startsWith(`${d}/`)) && !/\.test\.tsx?$/.test(path)) void schedule();
  });

  const handle = async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (VITE_OWN.test(path)) return next();
    await ready;
    await building;
    if (!live) return next();
    let file = normalize(join(live, path));
    if (file !== live && !file.startsWith(live + sep)) return next();
    try {
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return next();
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      let body: string | Buffer = readFileSync(file);
      if (type.startsWith('text/html') && !path.startsWith('/assets/')) {
        // Vite's client goes into each page, which is what makes it reload. (`transformIndexHtml` would do it, and then look for the page's
        // scripts among the source files.)
        body = body
          .toString('utf8')
          .replace(
            '</head>',
            `<script type="module" src="${server.config.base === './' ? '/' : server.config.base}@vite/client"></script></head>`,
          );
      }
      res.statusCode = 200;
      res.setHeader('content-type', type);
      res.end(body);
    } catch (error) {
      next(error);
    }
  };
  server.middlewares.use((req, res, next) => {
    handle(req, res, next).catch(next);
  });
}
