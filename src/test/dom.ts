import { adapt, reactive, withErrorHandler, type ReactiveState } from '../pipis/reactive.ts';
import { createElement, type JSXElement, type Reactive } from '../pipis/core.ts';

/** True when the tests are running in a real browser rather than jsdom. */
export const realBrowser = typeof navigator !== 'undefined' && !navigator.userAgent.includes('jsdom');

const roots = new Set<Element>();

/** Removes every container that `mount` made. Called after each test: the document also holds the test runner's own nodes. */
export function removeRoots() {
  for (const root of roots) root.remove();
  roots.clear();
}

/** Mounts `element` into a fresh container, and returns the container with a way to unmount. */
export function mount(element: JSXElement) {
  const root = document.createElement('div');
  document.body.append(root);
  roots.add(root);
  element(root);
  return {
    root,
    /** Unmounts the element, as its parent would. */
    unmount: () => {
      element();
    },
  };
}

/** The markup of a node's children, without the comment nodes that dynamic elements leave as anchors. */
export function html(node: Node): string {
  const copy = node.cloneNode(true);
  const comments = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const found: Node[] = [];
  while (comments.nextNode()) found.push(comments.currentNode);
  for (const comment of found) comment.parentNode?.removeChild(comment);
  return copy instanceof Element ? copy.innerHTML : (copy.textContent ?? '');
}

export type Tracked<T> = {
  /** Write through this one. */
  state: ReactiveState<T>;
  /** Hand this one to the code under test: it counts the subscriptions that are alive. */
  reactive: Reactive<T>;
  /** Subscriptions made through `reactive` and not yet undone. */
  readonly active: number;
  /** Every subscription ever made through `reactive`, undone or not. */
  readonly total: number;
};

/** A reactive value that counts how many subscriptions to it are alive, to catch a binding that is not undone on unmount. */
export function tracked<T>(initial: T): Tracked<T> {
  const state = reactive(initial);
  let active = 0;
  let total = 0;
  const counted = adapt({
    subscribe(callback: (newValue: T) => void) {
      active++;
      total++;
      const off = state.subscribe(callback);
      let done = false;
      return () => {
        if (!done) {
          done = true;
          active--;
          off();
        }
      };
    },
  });
  return {
    state,
    reactive: counted,
    get active() {
      return active;
    },
    get total() {
      return total;
    },
  };
}

/** `createElement` without the per-tag prop types, for tests that pass `data-*` props, unknown tags and the like. */
export function h(tag: string, props: Record<string, unknown> = {}, ...children: unknown[]): JSXElement {
  return createElement(tag as 'div', { ...props, children } as never);
}

/** Runs `fn` with an error handler that swallows errors, for a test that expects one and should not print it. */
export function quiet<T>(fn: () => T): T {
  return withErrorHandler(() => {}, fn);
}
