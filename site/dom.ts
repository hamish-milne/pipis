// pipis needs a DOM, and the build is not in a browser: jsdom is the document the pages are made in. An element is mounted into a node
// and read back as HTML, which is all a page is to the build.
import { JSDOM } from 'jsdom';

const NAMES = [
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLUnknownElement',
  'SVGElement',
  'DocumentFragment',
  'Text',
  'Comment',
  'Event',
];

let dom: JSDOM | undefined;

/** Makes jsdom's document the global one, once. Call before the library is first used. */
export function installDom(): void {
  if (dom) return;
  const { window } = (dom = new JSDOM('<!doctype html><body></body>'));
  Object.assign(globalThis, Object.fromEntries(NAMES.map((n) => [n, Reflect.get(window, n)])));
}

/** A mount function's result, as HTML: the element is mounted into a fresh node, and the node's content is read. */
export function toHtml(element: (parent?: Node) => unknown): string {
  installDom();
  const holder = document.createElement('div');
  element(holder);
  const html = holder.innerHTML;
  element();
  return html;
}
