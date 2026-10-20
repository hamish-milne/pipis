// Islands: a page that is made on a server and is mostly not interactive, with a few components that are. The server writes the whole page; the
// interactive parts are marked, and the browser mounts only those, so the browser's bundle has the code of the islands and nothing of the rest of
// the page (the Markdown, the layout, the highlighter), which it never needed.
//
// An island is a component that is used twice: by the page, on the server, which writes its markup inside a marker that says which component it
// is and what its props were, and by the browser's entry, which finds the markers and mounts each component over its markup. See the guide to
// islands, docs/guide/islands.md.
import { IS_CLIENT } from '#platform';
import type { Cleanup, JSXElement } from './base.ts';
import { createElement } from './core.ts';
import { serializeData } from './serialize.ts';

/** The attributes of the element that marks an island: which component it is, and its props as JSON. */
const NAME = 'data-island';
const PROPS = 'data-props';

/**
 * Renders `component` as an island: on a server, its markup inside an element that names it and carries its `props` as JSON, for `mountIslands`
 * to find in the browser; in the browser, just the component. The props have to be what JSON can hold, and are best small.
 *
 * The marker is an element with `display: contents`, so it takes no part in the layout of the page.
 */
export function Island<P extends object = {}>(props: { name: string; component: (props: P) => JSXElement; props?: P }): JSXElement {
  // The props of a component that takes none are an empty object.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- `P` can only be an object type, and `{}` is the one with nothing in it; a component that needs props is given them
  const given = (props.props ?? {}) as P;
  const content = props.component(given);
  if (IS_CLIENT) return content;
  const attributes: Record<string, string> = { [NAME]: props.name };
  if (props.props) attributes[PROPS] = serializeData(props.props);
  return createElement('div', { ...attributes, style: { display: 'contents' }, children: content });
}

/** Marks that an island's element has been mounted, so that mounting the page again does not mount it twice. */
const mounted = new WeakSet<Element>();

/**
 * Mounts the islands of the page: for each element that `Island` marked, in `root` (the document, if not given), the component of that name is
 * made with the props that were written, and mounted over what the server wrote. `components` is every island the page may have, by name, and
 * only those are in the bundle that imports them. It returns what unmounts them all.
 *
 * The server's markup of an island is replaced, not adopted: the page is complete before this runs, and the island's own markup is made again
 * by the component, so what an island shows has to be what the component makes when it is first mounted. An island that throws is reported and
 * leaves the rest of the page, and the other islands, as they are.
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
      // oxlint-disable-next-line typescript/consistent-type-assertions -- the props are what `Island` wrote for this component, which took them
      const element = (component as (props: unknown) => JSXElement)(JSON.parse(host.getAttribute(PROPS) ?? '{}'));
      host.textContent = '';
      element(host);
      mounted.add(host);
      unmounts.push(() => element());
    } catch (error) {
      console.error(error);
    }
  }
  return () => unmounts.forEach((unmount) => unmount());
}
