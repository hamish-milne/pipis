/// <reference lib="dom" />

// What every platform shares: the types of an element, the brand of a reactive value, and the few helpers that do not touch a DOM. The
// platform modules (`platform.client.ts`, `platform.server.ts`) build on this, and `core.ts` re-exports what is public.

/** Brand symbol used to identify {@link Reactive} values at runtime; see {@link isReactive}. */
export const REACTIVE = Symbol();

/** Unsubscribes from a {@link Reactive} value, or tears down an effect/binding. Safe to call more than once. */
export type Cleanup = () => void;

/**
 * A value that can be observed for changes. Implement this interface to bind a custom state
 * management solution (e.g. a store with its own `subscribe` method) into pipis.
 */
export type Reactive<T> = {
  readonly [REACTIVE]: true;
  /** Registers `callback` to be invoked with the current value immediately, and again on every change. */
  subscribe(callback: (newValue: T) => void): Cleanup;
};

/** An alternative to directly calling `subscribe` on a {@link Reactive} value, purely to optimize bundle size. */
export function subscribe<T>(reactive: Reactive<T>, callback: (value: T) => void) {
  return reactive.subscribe(callback);
}

/** A value that may be reactive or static: what a prop takes when it works the same either way. Check which with {@link isReactive}. */
export type MaybeReactive<T> = Reactive<T> | T;

/** Runtime type guard for {@link Reactive} values, based on the {@link REACTIVE} brand. */
// oxlint-disable-next-line typescript/consistent-type-assertions -- the brand is read off any value at all, which is the check that makes it a Reactive; narrowing to read it costs 19 bytes in every app
export const isReactive = <T>(value: unknown): value is Reactive<T> => (value as Reactive<T> | null)?.[REACTIVE] === true;

/** The first argument of an element: the node to mount into, or `undefined` to unmount. */
export type JSXParent = Node | undefined;

/** The second argument of an element: the node to mount before, or `null` to mount at the end of the parent. */
export type JSXSibling = Node | null;

/**
 * The result of a JSX expression: a function that mounts or unmounts a piece of DOM content.
 *
 * Call with a `parent` to mount: the element must insert its content into `parent`, immediately
 * before `sibling` (or at the end of `parent` if `sibling` is `null`). It must return a stable
 * "head" node - the leftmost node of its own content, or `sibling` unchanged if it renders nothing.
 * This return value is fixed at mount time; elements whose leftmost node can change later (because
 * their content is added, removed, or reordered dynamically) must return a persistent marker node
 * instead - see {@link createMarker} and the `dynamic` helper in `dynamic.ts`.
 *
 * Call with no `parent` to unmount: the element must remove its own DOM nodes and clean up any
 * subscriptions or effects. The return value is not meaningful in this mode.
 *
 * Calling mount again with the same `parent`/`sibling` (or moving to a different one) must be a
 * cheap, idempotent operation - see {@link moveNode}.
 */
export type JSXElement = (parent?: JSXParent, sibling?: JSXSibling) => Node | null;

/** A child that renders as a DOM text node: any other primitive value is stringified, `null`/`undefined` render as empty. */
export type Content = string | number | false | null | undefined;

/** What a child of an element can be: an element, text, or a reactive value that is text. */
export type JSXChild = JSXElement | Content | Reactive<Content>;

/** Children nested to any depth. */
export type JSXChildArray = readonly (JSXChild | JSXChildArray)[];

/** Props shape accepted by any element that can take JSX children. */
export type ChildrenProp = {
  readonly children?: JSXChild | JSXChildArray;
};

/** Props shape for the `ref` prop, accepted by every intrinsic element. */
export type RefProp<T> = {
  // `value` should be contravariant as it's write-only, but this isn't properly handled in TypeScript yet.
  readonly ref?: ((instance: T) => void) | { set value(_: T | null | undefined) };
};

/** Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object. */
export function setRef<T>(props: RefProp<T>, value: T) {
  const { ref } = props;
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.value = value;
  }
}

/**
 * Moves a node to a different position in the DOM, if needed.
 */
export function moveNode(element: ChildNode, parent: JSXParent, sibling?: JSXSibling) {
  const prevParent = element.parentNode;
  if (prevParent != parent || (sibling !== undefined && element.nextSibling != sibling)) {
    if (parent) {
      parent.insertBefore(element, sibling ?? null);
    } else {
      prevParent?.removeChild(element);
    }
    return true;
  }
  return false;
}
