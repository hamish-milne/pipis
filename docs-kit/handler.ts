// The documentation served by a server, not written as files: the middleware that a build for `build: 'server'` leaves beside the server's bundle (as
// `handler.js`, this module with its types blanked out), for any Node server that takes `(request, response, next)`: Express, Connect, Fastify's
// middie, or `node:http` itself. It renders a page when it is asked for, with the same `render` that the build of static files calls, so the page is
// the one the build would have written. It knows only the files that sit beside it, and Node: nothing else of the kit.
//
//   import express from 'express';
//   import { createHandler } from './dist-server/handler.js';
//   const app = express();
//   app.use(express.static('dist'));       // the scripts, the style sheets, the frames of the examples, the demos, the search index
//   app.use(await createHandler());        // the pages
//   app.listen(3000);
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assets, PageData, PageModel, PagesData } from './pages.ts';

export interface HandlerOptions {
  /** The path the site is served under, if it is not `/`: `/docs/` for `https://example.com/docs/`. The pages link by relative paths, so this is all they need. */
  base?: string;
  /**
   * Where the files are that a page reads as it is rendered (a demo shows the source of its app from `src/samples`). They are where they were
   * when the site was built, unless this says otherwise.
   */
  sourceRoot?: string;
}

type Next = (error?: unknown) => void;

/** `target` as a link from `from`, both being site paths (docs-kit/markdown.ts has the same, and a test holds them together). */
const relativeUrl = (from: string, target: string): string => {
  const rel = posix.relative(posix.dirname(from), target);
  return rel === '' ? posix.basename(target) : rel;
};
/** What a page is called on a site that is a single page (docs-kit/markdown.ts has the same). */
const pageId = (url: string): string => url.replace(/\.html$/, '').replace(/\//g, '-');

/** The models of the pages that `pagesData` wrote. */
export function pagesOf(data: PagesData, sourceRoot?: string): PageModel[] {
  const items = data.nav.flatMap((s) => s.items);
  const item = (url?: string) => items.find((i) => i.url === url);
  const model = (page: PageData): PageModel => ({
    ...page,
    ...(sourceRoot === undefined ? {} : { sourceRoot }),
    nav: data.nav,
    current: item(page.current),
    previous: item(page.previous),
    next: item(page.next),
    merged: page.merged?.map(model),
    href: (target) => (data.single ? `#${pageId(target)}` : relativeUrl(page.url, target)),
  });
  return data.pages.map(model);
}

/** The middleware: pages for the addresses of the site, and the next handler for anything else. */
export async function createHandler(options: HandlerOptions = {}) {
  const dir = dirname(fileURLToPath(import.meta.url));
  const data: PagesData = JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8'));
  const assets: { script: string; styles: string[] } = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8'));
  // The server's bundle is written beside this module by the build: there is no source for it to be checked against.
  const entry = './server.js';
  const { render }: { render: (page: PageModel, assets: Assets) => string } = await import(entry);
  const pages = pagesOf(data, options.sourceRoot);
  const base = (options.base ?? '/').replace(/\/?$/, '/');

  return function docs(request: IncomingMessage, response: ServerResponse, next: Next) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!path.startsWith(base)) return next();
    const rest = path.slice(base.length);
    const wanted = rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest;
    const page = pages.find((p) => p.url === wanted);
    if (!page) return next();
    try {
      const html = `<!doctype html>\n${render(page, { script: `${page.root}${assets.script}`, styles: assets.styles.map((s) => `${page.root}${s}`) })}\n`;
      response.statusCode = 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : html);
    } catch (error) {
      next(error);
    }
  };
}
