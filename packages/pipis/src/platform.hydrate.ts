/// <reference lib="dom" />

// The hydrating platform: a browser's, which adopts the nodes of a page that a server wrote as the page's elements are mounted, instead of making
// them. It is the browser's platform (dom.ts) plus what finds the nodes, and a `pipis-hydrate` build is the one that has it; see
// docs/adr/0021-hydration.md.
//
// How a node is found. Elements are mounted from the last to the first of their siblings, each before the one mounted just before it (`sibling`), so
// what an element wants is the node that is just before `sibling`, or the last of its parent. It is the node of its tag; a text node is a text node, and
// a marker is a comment. A node that is in the way (one the server wrote and the page does not have) is taken out when the one wanted is found
// beyond it. A node that is not found is made, where it should be. A node that is not wanted by anything is taken out when its parent has been
// mounted. So the page that is left is the page that was made, whatever the server wrote, and the difference is counted.
import { type Cleanup, type Content, type JSXElement, type Reactive, isReactive, moveNode, subscribe } from './base.ts';
import { setText } from './internal.ts';
import { createNode } from './dom.ts';
import type { HydrationReport } from './hydrate.ts';

/** The default report of a mismatch: a line on the console. */
export function logMismatch({ missing, extraneous, error }: HydrationReport) {
  const found = error === undefined ? `${missing} missing and ${extraneous} extra nodes` : 'an error, and the page was built again';
  console.warn(`pipis: the page did not match what the server wrote (${found}).`, error ?? '');
}

export { createMarker, createNode, head, setAttribute } from './dom.ts';

/** Whether the code runs in a browser: `true` here. */
export const IS_CLIENT: boolean = true;

/** Whether the code runs on a server: `false` here. */
export const IS_SERVER: boolean = false;

/** Whether a page that a server wrote is adopted as it is mounted: `true` here, a constant. */
export const IS_HYDRATE: boolean = true;

// ---- the state of the hydration in progress, if there is one. A hydration is synchronous, so there is one at a time.
let active = false;
/** The nodes of the server's page that nothing has taken yet. */
let unclaimed = new WeakSet<Node>();
/** Where a search for a node stops: the start of the region it is in, or nothing, for the children of an element. */
const bounds: (Node | null)[] = [];
let tally: HydrationReport = { missing: 0, extraneous: 0 };
let deferred: (() => void)[] = [];

/** Whether a page is being hydrated. */
export const hydrating = () => active;

/** Runs `run` when the hydration is done (or at once, if there is none): effects and refs are for a page that is whole. */
export function defer(run: () => void) {
  if (active) deferred.push(run);
  else run();
}

/** Runs `run` as if no page were being hydrated: what it mounts is made, not adopted (the head, which the hydration has cleared). */
export function plain(run: () => void) {
  const before = active;
  active = false;
  try {
    run();
  } finally {
    active = before;
  }
}

/** Runs `run` with the search for nodes stopping at `bound`. */
export function bounded<T>(bound: Node | null, run: () => T): T {
  bounds.push(bound);
  try {
    return run();
  } finally {
    bounds.pop();
  }
}

const HTML = 'http://www.w3.org/1999/xhtml';
const RAW = /^(?:script|style|title|textarea|iframe|noembed|noframes|plaintext|xmp)$/;

/** Whether the text of `parent` is written without markers, because a comment in it would be text. */
const isRawText = (parent: Node) => parent instanceof Element && parent.namespaceURI === HTML && RAW.test(parent.localName);

/**
 * The node before `sibling` (or the last of `parent`) that `wanted` says yes to, taken from the page; null if there is none. The nodes between it and
 * where it was looked for from are in the way, and are taken out. A claimed node, or a made one, is another's: the search ends there.
 */
function claim(parent: Node, sibling: Node | null, wanted: (node: Node) => boolean): Node | null {
  const stop = bounds[bounds.length - 1] ?? null;
  const skipped: Node[] = [];
  let found: Node | null = null;
  for (let node = sibling ? sibling.previousSibling : parent.lastChild; node && node !== stop; node = node.previousSibling) {
    if (!unclaimed.has(node)) break;
    if (wanted(node)) {
      found = node;
      break;
    }
    skipped.push(node);
  }
  if (found) {
    unclaimed.delete(found);
    for (const node of skipped) remove(node);
  }
  return found;
}

function remove(node: Node) {
  unclaimed.delete(node);
  node.parentNode?.removeChild(node);
  tally.extraneous++;
}

/** The element for a tag that the server wrote where this one is mounted, or a new one, put there. */
export function claimElement(type: string, parent: Node, sibling: Node | null): Element {
  const tag = type.toLowerCase();
  const found = claim(parent, sibling, (n) => n instanceof Element && n.localName.toLowerCase() === tag);
  if (found instanceof Element) return found;
  const made = createNode(type);
  parent.insertBefore(made, sibling);
  tally.missing++;
  return made;
}

/** Takes out what the page did not take: the nodes of the server's that are left in `parent`, which nothing mounted into it wanted. */
export function sweep(parent: Node) {
  for (let node = parent.firstChild, next; node; node = next) {
    next = node.nextSibling;
    if (unclaimed.has(node)) remove(node);
  }
}

/** Mounts the content of a region that a server wrote between two markers, and takes out what its content did not want. Returns the region's own marker. */
export function claimRegion(
  parent: Node,
  sibling: Node | null,
  made: Comment,
  mount: (parent: Node, sibling: Node | null) => Cleanup | void,
): { marker: Comment; cleanup: Cleanup | void } {
  const stop = bounds[bounds.length - 1] ?? null;
  // The end, which is taken out: the region ends where `sibling` is.
  const end = claim(parent, sibling, (n) => n instanceof Comment && n.data === '/');
  let start: Comment | undefined;
  if (end) {
    // The start is the marker that is not the end of a region inside this one.
    let depth = 0;
    for (let node = end.previousSibling; node && node !== stop; node = node.previousSibling) {
      if (!(node instanceof Comment)) continue;
      if (node.data === '/') depth++;
      else if (node.data === '' && depth-- === 0) {
        start = node;
        break;
      }
    }
    parent.removeChild(end);
  }
  if (start) {
    unclaimed.delete(start);
  } else {
    // The server wrote no markers for it: it is made where it should be, and has none of the server's nodes.
    tally.missing++;
    parent.insertBefore(made, sibling);
  }
  const marker = start ?? made;
  const cleanup = bounded(marker, () => mount(parent, sibling));
  for (let node = marker.nextSibling, next; node && node !== sibling; node = next) {
    next = node.nextSibling;
    if (unclaimed.has(node)) remove(node);
  }
  return { marker, cleanup };
}

/** Takes what a server wrote for a region as it is, without making anything: for what the browser need not have the code of. Returns the nodes, to be removed with it. */
export function adoptRange(parent: Node, sibling: Node | null): Node[] {
  const stop = bounds[bounds.length - 1] ?? null;
  const nodes: Node[] = [];
  for (let node = sibling ? sibling.previousSibling : parent.lastChild; node && node !== stop; node = node.previousSibling) {
    if (!unclaimed.delete(node)) break;
    nodes.push(node);
  }
  return nodes;
}

/** A text node: the same as the browser's, and while a page is hydrated, the text node of the server's page that is where this one is mounted. */
export function textNode(content: Content | Reactive<Content>): JSXElement {
  let node = document.createTextNode('');
  let contentReactive: Reactive<Content> | undefined;
  if (isReactive(content)) {
    contentReactive = content;
  } else {
    setText(node, content);
  }
  let cleanup: Cleanup | undefined;
  let adopted = false;
  return function textNode_element(parent, sibling = null) {
    if (parent) {
      if (!adopted && active) {
        adopted = true;
        node = claimText(parent, sibling, node);
        // The server's text may not be this text.
        if (!isReactive(content)) setText(node, content);
      }
      cleanup ??=
        contentReactive &&
        subscribe(contentReactive, function textNode_binding(newValue) {
          setText(node, newValue);
        });
    } else {
      cleanup?.();
      cleanup = undefined;
    }
    moveNode(node, parent, sibling);
    return parent ? node : sibling;
  };
}

/**
 * The text node that the server wrote where a text node is mounted. A text node begins with a marker (`<!--t-->`), because the text nodes next to
 * each other are one when the page is parsed; a marker with no text after it is a text node that is empty. `made` is put where it belongs when
 * there is nothing.
 */
function claimText(parent: Node, sibling: Node | null, made: Text): Text {
  const raw = isRawText(parent);
  const found = claim(parent, sibling, (n) => n instanceof Text || (!raw && n instanceof Comment && n.data === 't'));
  if (found instanceof Text) {
    const before = found.previousSibling;
    if (!raw && before instanceof Comment && before.data === 't' && unclaimed.delete(before)) parent.removeChild(before);
    return found;
  }
  if (found) {
    // A marker and no text: the text was empty, which the page can be again.
    parent.insertBefore(made, found);
    parent.removeChild(found);
    return made;
  }
  parent.insertBefore(made, sibling);
  tally.missing++;
  return made;
}

function walk(root: Node) {
  const stack: Node[] = [root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      unclaimed.add(child);
      stack.push(child);
    }
  }
}

/** Takes out the head that the server's components wrote, which is between `<!--h-->` and `<!--/h-->`: the page's own are made again. */
function clearHead() {
  for (let node = document.head.firstChild; node; node = node.nextSibling) {
    if (node instanceof Comment && node.data === 'h') {
      while (node.nextSibling && !(node.nextSibling instanceof Comment && node.nextSibling.data === '/h'))
        document.head.removeChild(node.nextSibling);
      node.nextSibling?.remove();
      node.remove();
      return;
    }
  }
}

/**
 * Hydrates `container`: mounts `element` into it, adopting what the server wrote there. It is synchronous, and when it is done the page is as it
 * would have been made by the browser alone, and everything is as it is for a page that the browser made: what was held back (the effects, and the
 * refs) has run. Returns what it found. If it fails, the page is made again, from nothing. `head` is whether what the server's `Helmet` wrote is
 * replaced: the first hydration of a page does that, and a later one (an island's) does not.
 */
export function hydrateInto(container: Element, element: JSXElement, head = true): HydrationReport {
  if (active) throw new Error('hydrate was called while another page was being hydrated.');
  active = true;
  unclaimed = new WeakSet();
  tally = { missing: 0, extraneous: 0 };
  deferred = [];
  bounds.length = 0;
  walk(container);
  if (head) clearHead();
  let failure: unknown;
  try {
    bounded(null, () => element(container));
    sweep(container);
  } catch (error) {
    failure = error;
  } finally {
    active = false;
    bounds.length = 0;
  }
  if (failure !== undefined) {
    // Nothing that the page held back is run for a page that is made again: it runs as it is mounted.
    deferred = [];
    try {
      element();
    } catch (error) {
      // What was half-made is being made again, so this matters only to whoever is looking for why it failed.
      console.error(error);
    }
    container.textContent = '';
    element(container);
    return { ...tally, error: failure };
  }
  const run = deferred;
  deferred = [];
  for (const task of run) task();
  return { ...tally };
}
