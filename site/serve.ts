// Serves a built site over HTTP, for looking at it (the example frames and the search need a server, not a file:// address) and for
// the tests of the site.
//   node site/serve.ts [dir] [--port N] [--prefix /some/path/]
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Serves `dir` at `prefix` (`/` by default), listening on `port` (any free one if 0). */
export async function serve(dir: string, port = 0, prefix = '/'): Promise<{ server: Server; url: string }> {
  const base = resolve(dir);
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
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done));
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://127.0.0.1:${actual}${prefix}` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const dir =
    args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? join(dirname(fileURLToPath(import.meta.url)), '../dist');
  const { url } = await serve(dir, Number(value('--port') ?? 4173), value('--prefix') ?? '/');
  console.log(`Serving ${dir} at ${url}`);
}
