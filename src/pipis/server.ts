// The `pipis/server` entry point: an element as HTML. For the server's build of an app, which is the one where `pipis` is the server
// platform (see docs/adr/0019-server-rendering.md); in any other, `renderToString` says so.
import { IS_CLIENT } from '#platform';
import type { JSXElement } from './base.ts';
import { renderRoot } from './platform.server.ts';

/** The result of {@link renderToString}. */
export interface RenderResult {
  /** The markup of the element. */
  html: string;
  /** What `Helmet` rendered, as markup for the document's `<head>`. */
  head: string;
}

/** What {@link renderToString} can be asked. */
export interface RenderOptions {
  /**
   * Write markup that a browser can hydrate: each text node, and where each region ends, is marked, and what `Helmet` wrote is marked. The
   * markup is a little larger and the same to read. Leave it off for a page that is not hydrated (a static site, or one with islands).
   */
  hydratable?: boolean;
}

/**
 * Renders an element to HTML. It is synchronous: the element is mounted, its markup is read, and it is unmounted, so nothing is left
 * subscribed, and a state change after it has no effect. Reactive values are shown as they are when it is mounted. `Effect`, `Watch`, `Portal`
 * and `Suspense`'s promise do not run, and event handlers and `ref`s are not used: they are for a browser.
 *
 * It throws if `pipis` is the browser's build rather than the server's, which is the bundler's to choose: see the guide to server rendering.
 */
export function renderToString(element: JSXElement, options: RenderOptions = {}): RenderResult {
  if (IS_CLIENT) {
    throw new Error(
      "renderToString needs the server build of pipis, and this is the browser's: build the server with the 'pipis-server' condition (in Vite, `ssr.resolve.conditions: ['pipis-server']` and `ssr.noExternal: ['pipis']`; in Node, `--conditions=pipis-server`).",
    );
  }
  return renderRoot(element, options.hydratable === true);
}

export { serializeData } from './serialize.ts';
