/// <reference lib="dom" />

// The browser's platform: nodes are the document's own. This is what `pipis` is unless the bundler is told it is a server or that a page is to
// be hydrated (the `pipis-server` and `pipis-hydrate` conditions of the `#platform` import in package.json).
export { createMarker, createNode, head, setAttribute, textNode } from './dom.ts';

/** Whether the code runs in a browser. `true` here, and in the hydrating build; `false` in the server's. A constant, so what depends on it is removed from the build that cannot use it. */
export const IS_CLIENT: boolean = true;

/** Whether the code runs on a server: the other side of {@link IS_CLIENT}. A constant. */
export const IS_SERVER: boolean = false;

/** Whether a page that a server wrote is being adopted: `true` only in the build that hydrates (the `pipis-hydrate` condition). A constant. */
export const IS_HYDRATE: boolean = false;
