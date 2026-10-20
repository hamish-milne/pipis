// Islands: a page that is made on a server and is mostly not interactive, with a few components that are. The server writes the whole page; the
// interactive parts are marked, and the browser mounts only those, so the browser's bundle has the code of the islands and nothing of the rest of
// the page (the Markdown, the layout, the highlighter), which it never needed.
//
// An island is a component that is used twice: by the page, on the server, which writes its markup inside a marker that says which component it
// is and what its props were, and by the browser's entry, which finds the markers and mounts each component over its markup. See the guide to
// islands, docs/guide/islands.md.
import { IS_CLIENT, IS_HYDRATE } from '#platform';
import { moveNode, type Cleanup, type JSXElement } from './base.ts';
import { createElement, emptyElement } from './core.ts';
import { Static } from './hydrate.ts';
import { hydrateInto, logMismatch } from './hydrated.ts';
import { serializeData } from './serialize.ts';

/** The attributes of the element that marks an island: which component it is, and its props as JSON. */
const NAME = 'data-island';
const PROPS = 'data-props';
/** The attribute of the element that marks content that only the server makes, inside an island. */
const SLOT = 'data-slot';

/** The server's content of the island that is being made in the browser, by slot name: what `Slot` takes. */
let slots: Map<string, Element> | undefined;

/** Marks that an island's element has been mounted, so that mounting the page again does not mount it twice. */
const mounted = new WeakSet<Element>();

/**
 * Renders `component` as an island: on a server, its markup inside an element that names it and carries its `props` as JSON, for `mountIslands`
 * to find in the browser; in the browser, just the component. The props have to be what JSON can hold, and are best small.
 *
 * The marker is an element with `display: contents`, so it takes no part in the layout of the page. In a build that hydrates the marker is made in
 * the browser as well, because the server wrote it and a page that is hydrated is made of what the server wrote; it is then the page's own, and
 * `mountIslands` leaves it.
 */
export function Island<P extends object = {}>(props: { name: string; component: (props: P) => JSXElement; props?: P }): JSXElement {
  // The props of a component that takes none are an empty object.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- `P` can only be an object type, and `{}` is the one with nothing in it; a component that needs props is given them
  const given = (props.props ?? {}) as P;
  const content = props.component(given);
  if (IS_CLIENT && !IS_HYDRATE) return content;
  const attributes: Record<string, string> = { [NAME]: props.name };
  if (props.props) attributes[PROPS] = serializeData(props.props);
  return createElement('div', {
    ...attributes,
    style: { display: 'contents' },
    ref: IS_HYDRATE ? (el: Element) => void mounted.add(el) : undefined,
    children: content,
  });
}

/**
 * Content inside an island that only the server can make (the highlighted code of a block, say), which the browser takes as it was written. The
 * server calls `children` and writes what it makes inside a marker; the browser, which does not have `children` (an island's props are JSON, and a
 * function is not), moves the marker, with what is in it, out of the markup that the island replaces and into the island's own. So the content is
 * not made again, and does not flash, and what makes it is not in the browser's bundle. A page that is hydrated adopts it in place. A name tells
 * two slots of one island apart; slots are taken as the island is made, so they cannot be in what an island shows later.
 */
export function Slot(props: { name?: string; children?: () => JSXElement }): JSXElement {
  const name = props.name ?? 'content';
  if (IS_CLIENT && !IS_HYDRATE) {
    const server = slots?.get(name);
    if (!server) return props.children?.() ?? emptyElement;
    return function Slot_element(parent, sibling = null) {
      moveNode(server, parent, sibling);
      return parent ? server : sibling;
    };
  }
  const attributes: Record<string, string> = { [SLOT]: name };
  return createElement('div', { ...attributes, style: { display: 'contents' }, children: Static({ children: props.children }) });
}

/**
 * Mounts the islands of the page: for each element that `Island` marked, in `root` (the document, if not given), the component of that name is
 * made with the props that were written, and mounted over what the server wrote. `components` is every island the page may have, by name, and
 * only those are in the bundle that imports them. It returns what unmounts them all.
 *
 * The server's markup of an island is replaced, not adopted: the page is complete before this runs, and the island's own markup is made again
 * by the component, so what an island shows has to be what the component makes when it is first mounted. In a build that hydrates it is adopted
 * (each island is a page of its own to `hydrate`, with the same repair and report), so nothing flashes and nothing that a reader has done is lost.
 * An island that throws is reported and leaves the rest of the page, and the other islands, as they are.
 */
export function mountIslands(components: Record<string, (props: never) => JSXElement>, root: ParentNode = document): Cleanup {
  const unmounts: Cleanup[] = [];
  for (const host of root.querySelectorAll<HTMLElement>(`[${NAME}]`)) {
    // An island inside one that was mounted is gone from the page: the component of the outer one made its own.
    if (mounted.has(host) || !host.isConnected) continue;
    const name = host.getAttribute(NAME) ?? '';
    try {
      const component = components[name];
      if (!component)
        throw new Error(`No island '${name}' was given to mountIslands; it has ${Object.keys(components).join(', ') || 'none'}`);
      // The server's content in the island, which its own `Slot`s take as the island is made (a page that is hydrated adopts it in place).
      if (!IS_HYDRATE) {
        slots = new Map();
        for (const slot of host.querySelectorAll(`[${SLOT}]`)) {
          if (slot.closest(`[${NAME}]`) === host) slots.set(slot.getAttribute(SLOT) ?? '', slot);
        }
      }
      let element: JSXElement;
      try {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- the props are what `Island` wrote for this component, which took them
        element = (component as (props: unknown) => JSXElement)(JSON.parse(host.getAttribute(PROPS) ?? '{}'));
      } finally {
        slots = undefined;
      }
      if (IS_HYDRATE) {
        const report = hydrateInto(host, element, false);
        if (report.missing || report.extraneous || report.error !== undefined) logMismatch(report);
      } else {
        host.textContent = '';
        element(host);
      }
      mounted.add(host);
      unmounts.push(() => element());
    } catch (error) {
      console.error(error);
    }
  }
  return () => unmounts.forEach((unmount) => unmount());
}
