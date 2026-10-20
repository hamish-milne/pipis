// Serves a built site over HTTP, for looking at it (the example frames and the search need a server, not a file:// address) and for
// the tests of the site.
//   node apps/docs/src/serve.ts [dir] [--port N] [--prefix /some/path/] [--server dir-server]
// A site built with `build: 'server'` has no page files: `--server` is the folder the build wrote beside it, and its middleware renders the pages.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
};

/** A middleware, as Express, Connect and `node:http` servers take them. */
export type Middleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void;

/**
 * Serves `dir` at `prefix` (`/` by default), listening on `port` (any free one if 0). What is not a file of `dir` goes to `pages`, if there is one:
 * the middleware that renders the pages of a site that was built for a server.
 */
export async function serve(dir: string, port = 0, prefix = '/', pages?: Middleware): Promise<{ server: Server; url: string }> {
  const base = resolve(dir);
  const notFound = (response: ServerResponse) => {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      if (!path.startsWith(prefix)) throw new Error('outside the prefix');
      let file = normalize(join(base, path.slice(prefix.length)));
      if (file !== base && !file.startsWith(base + sep)) throw new Error('outside the folder');
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      if (!pages) return notFound(res);
      pages(req, res, (error) => {
        if (error) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(error instanceof Error ? error.message : 'The page did not render');
        } else {
          notFound(res);
        }
      });
    }
  });
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://127.0.0.1:${actual}${prefix}` };
}

/** The middleware that a build for a server wrote into `dir` (`handler.js`), for the pages under `prefix`. */
export async function pagesOf(dir: string, prefix = '/'): Promise<Middleware> {
  const { createHandler }: { createHandler: (options: { base: string }) => Promise<Middleware> } = await import(
    pathToFileURL(join(resolve(dir), 'handler.js')).href
  );
  return await createHandler({ base: prefix });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const dir =
    args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '../dist');
  const prefix = value('--prefix') ?? '/';
  const serverDir = value('--server');
  const { url } = await serve(dir, Number(value('--port') ?? 4173), prefix, serverDir ? await pagesOf(serverDir, prefix) : undefined);
  console.log(`Serving ${dir} at ${url}`);
}
