// The `pipis/hydrate` entry point: a page that a server wrote, made live. For the browser's build of an app that is rendered on a server, which is
// the one where `pipis` is the hydrating platform (see docs/adr/0021-hydration.md); in any other, `hydrate` says so.
import { IS_HYDRATE } from '#platform';
import type { Cleanup, JSXElement } from './base.ts';
import { dynamic } from './dynamic.ts';
import { adoptRange, hydrating } from './hydrated.ts';
import { hydrateInto } from './platform.hydrate.ts';

/** What a hydration found of the page: nodes it had to make because the server's page had none, and nodes of the server's that the page did not want. */
export interface HydrationReport {
  missing: number;
  extraneous: number;
  /** The error that made the page be built again from nothing, if one did. */
  error?: unknown;
}

/** What {@link hydrate} can be given. */
export interface HydrateOptions {
  /**
   * Told what the hydration found, when it found something to tell: nodes the server's page had and the app does not (`extraneous`), nodes the
   * app has and the server's page did not (`missing`), or an error that made the page be built again (`error`). The page is right either way. The
   * default logs it to the console; pass a function to do something else (or one that does nothing, to be told nothing).
   */
  onMismatch?: (report: HydrationReport) => void;
}

function logMismatch({ missing, extraneous, error }: HydrationReport) {
  const found = error === undefined ? `${missing} missing and ${extraneous} extra nodes` : 'an error, and the page was built again';
  console.warn(`pipis: the page did not match what the server wrote (${found}).`, error ?? '');
}

/**
 * Makes the page that a server wrote in `container` live: mounts `element` into it, adopting the nodes that are there instead of making new ones,
 * so what the person sees, and has done to it (the focus, the scroll, what is typed), stays. It is synchronous. State may not be written while it
 * runs; an `Effect`, a `Watch` and a `ref` are held until the page is whole, and then run.
 *
 * The page need not be what the app would make: a node that is missing is made, and one that is not wanted is removed, and the difference is
 * reported to `onMismatch`. If the app throws, the page is made again, from nothing, and that is reported too.
 *
 * It throws if `pipis` is the browser's build rather than the hydrating one, which is the bundler's to choose: see the guide to hydration.
 */
export function hydrate(container: Element, element: JSXElement, options: HydrateOptions = {}): void {
  if (!IS_HYDRATE) {
    throw new Error(
      "hydrate needs the hydrating build of pipis, and this is not it: build the browser's code with the 'pipis-hydrate' condition (in Vite, `resolve.conditions: ['pipis-hydrate']`).",
    );
  }
  const report = hydrateInto(container, element);
  if (report.missing || report.extraneous || report.error !== undefined) (options.onMismatch ?? logMismatch)(report);
}

/**
 * Content that never changes, which a page that is hydrated takes as the server wrote it, without running `children`: so what makes it (a
 * Markdown renderer, say) need not be run in the browser, and, with a build that leaves it out, is not in the page's code. Anywhere else it is
 * its content, made from `children()`.
 */
export function Static({ children }: { children: () => JSXElement }): JSXElement {
  let content: JSXElement | undefined;
  return dynamic(
    function Static_mount(parent, sibling): Cleanup | void {
      if (IS_HYDRATE && hydrating()) {
        const adopted = adoptRange(parent, sibling);
        return function Static_remove() {
          for (const node of adopted) node.parentNode?.removeChild(node);
        };
      }
      content ??= children();
      content(parent, sibling);
    },
    function Static_unmount() {
      content?.();
    },
  );
}
