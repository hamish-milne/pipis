import { _ as moveNode, a as Fragment, b as textNode, c as JSXSibling, d as Reactive, f as RefProp, g as isReactive, h as emptyElement, i as CoreIntrinsicElements, l as MaybeReactive, m as createMarker, n as Cleanup, o as JSXElement, p as createElement, r as Content, s as JSXParent, t as ChildrenProp, u as REACTIVE, v as setRef, y as subscribe } from "./core-ZOLNwdry.mjs";
//#region src/pipis/reactive.d.ts
/**
 * Adapts an object with a `subscribe` method to be recognized as a reactive object by setting the `[REACTIVE]` property.
 */
export declare function adapt<T extends {
  subscribe: (callback: (newValue: any) => void) => () => void;
}>(obj: T): T & {
  [REACTIVE]: true;
};
/** A {@link Reactive} value with synchronous, always-up-to-date read access via `.value`. */
export type ReactiveReadonly<T> = Reactive<T> & {
  get value(): T;
};
/** A {@link ReactiveReadonly} value that can also be written to via `.value`, notifying subscribers. */
export type ReactiveState<T> = ReactiveReadonly<T> & {
  set value(newValue: T);
};
/** Creates a simple, independently-writable {@link ReactiveState} value. */
export declare function reactive<T>(initialValue: T): ReactiveState<T>;
export declare function reactive<T>(initialValue?: T): ReactiveState<T | undefined>;
/** Derives a read-only reactive value from `input` by applying `compute`, only notifying subscribers when the result actually changes. */
export declare function select<TIn, TOut>(input: Reactive<TIn>, compute: (input: TIn) => TOut): Reactive<TOut>;
/** Derives a read-only reactive value by selecting a single property key out of `input`. */
export declare function select<TIn, TKey extends keyof TIn>(input: Reactive<TIn>, key: TKey): Reactive<TIn[TKey]>;
/** Wraps a static value as a {@link ReactiveReadonly}, for APIs that require a reactive input. */
export declare const constant: <T>(value: T) => ReactiveReadonly<T>; /**
 * Creates a context: a `[provider, consumer]` pair for passing a value down the component tree
 * without threading it through every level of props. The consumer resolves to the nearest
 * enclosing provider's value at the time the component is constructed.
 */
export declare function defineContext<T>(defaultValue: T): readonly [<U>(value: T, inner: () => U) => U, () => T];
export type ErrorHandler = (error: unknown) => void;
export declare const withErrorHandler: <U>(value: ErrorHandler, inner: () => U) => U, getErrorHandler: () => ErrorHandler;
type AnyFunction = (...args: any[]) => any;
type AddReturnType<F extends AnyFunction, R> = (...args: Parameters<F>) => ReturnType<F> | R;
export declare function handleError<T extends AnyFunction>(fn: T, err?: undefined): AddReturnType<T, undefined>;
export declare function handleError<T extends AnyFunction, TErr>(fn: T, err: TErr): AddReturnType<T, TErr>;
export declare function subscribeWithCatch<T>(reactive: Reactive<T>, callback: (newValue: T) => void): () => void;
//#endregion
//#region src/pipis/dynamic.d.ts
type MountFn = (parent: Exclude<JSXParent, undefined>, sibling: JSXSibling) => Cleanup | void;
/**
 * Builds a {@link JSXElement} whose content can change shape over time (be added, removed, or
 * reordered) without breaking the fixed "head" contract that {@link JSXElement} requires.
 *
 * A persistent {@link createMarker marker} node is inserted once, immediately before the original
 * `sibling`, before `mount` ever runs - so it's always the leftmost node of the region, and is
 * always returned as this element's head, however its content changes later. `mount` is free to
 * insert/move/remove real content anywhere between the marker and `sibling`.
 *
 * `mount` is only called once per mount (guarded with `cleanup ??=`), so subscribing inside it is
 * safe even if the returned element's mount function is invoked again with the same parent.
 */
export declare function dynamic(mount: MountFn, unmount: Cleanup): JSXElement;
/**
 * Renders items from an array, keyed by `itemKey` so items can be added, removed, and reordered
 * without recreating unaffected items. Each item is (re-)mounted on every update by iterating
 * back-to-front and chaining each item's returned head node as the next item's `sibling`; combined
 * with {@link moveNode}, an item only costs a real DOM operation when it actually moved.
 */
export declare function List<T>({ items, itemKey, children }: {
  items: Reactive<readonly T[]>;
  itemKey: (item: T, index: number) => PropertyKey;
  children: (item: T, index: number) => JSXElement;
}): JSXElement;
/** Mounts one of several elements, chosen by `selector`, unmounting the previous choice on change. */
export declare function OneOf<T extends PropertyKey>({ selector, children }: {
  selector: Reactive<T>;
  children: Partial<Record<T, JSXElement>>;
}): JSXElement;
/** Conditionally renders its child based on a boolean reactive value. */
export declare function If({ condition, ...props }: {
  condition: Reactive<boolean>;
} & ChildrenProp): JSXElement;
/**
 * Renders content computed from a reactive value, fully recreating the DOM whenever it changes.
 * Prefer {@link OneOf}, {@link List}, or {@link Repeat} where they fit; those update in place
 * instead of throwing away and rebuilding the DOM on every change.
 */
export declare function Dynamic<T>({ value, children }: {
  value: Reactive<T>;
  children: (props: T) => JSXElement;
}): JSXElement;
/** Renders nothing, but runs `fn` on mount and its returned cleanup (if any) on unmount. */
export declare function effect(fn: () => Cleanup | undefined): JSXElement;
/** JSX-friendly wrapper around {@link effect}, for running a side effect on mount/unmount. */
export declare const Effect: (props: {
  children: () => Cleanup | undefined;
}) => JSXElement;
/** Runs `children` with the current value on mount, and again on every subsequent change. */
export declare function Watch<T>({ value, children }: {
  value: Reactive<T>;
  children: (newValue: T) => void;
}): JSXElement;
/**
 * Renders `children` (or `success`, if omitted) while `promise` is pending, `success` once it
 * resolves, and `error` if it rejects. Does not offer timeout/retry/streaming; for that level of
 * control, consider a dedicated data-fetching library layered on top.
 */
export declare function Suspense<T>({ promise, placeholder, success, error, ...props }: {
  promise: (() => Promise<T>) | Reactive<Promise<T>>;
  placeholder: T;
  success: (value: ReactiveReadonly<T>) => JSXElement;
  error?: (err: ReactiveReadonly<unknown>) => JSXElement;
} & ChildrenProp): JSXElement;
/**
 * Catches errors thrown synchronously while mounting `children` and renders `fallback` instead.
 * Only covers the mount call itself - errors thrown later, e.g. from a reactive binding's
 * subscriber callback or an {@link Effect}, are not caught. Use a global error handler (such as
 * `window.onerror`) alongside a reactive flag for those cases.
 */
export declare function ErrorBoundary({ fallback, ...props }: {
  fallback: (err: ReactiveReadonly<unknown>) => JSXElement;
} & ChildrenProp): JSXElement;
/** The `[parent, sibling]` mount position captured by a {@link PortalTarget}, or `undefined` if it isn't mounted. */
export type PortalTargetValue = readonly [Node, Node | null] | undefined;
/**
 * Marks a spot in the tree for a {@link Portal} to render into. Renders nothing itself; assign
 * its position (via `ref`) to a reactive value and pass that to a `Portal`'s `target` prop.
 */
export declare function PortalTarget(props: RefProp<PortalTargetValue>): JSXElement;
/**
 * Renders `children` into the position captured by a {@link PortalTarget}, wherever that is in
 * the DOM. Since the captured position is a pair of live node references rather than a snapshot,
 * this keeps working correctly even if the target is later moved (e.g. as part of a reordering
 * {@link List}).
 */
export declare function Portal({ target, ...props }: {
  target: Reactive<PortalTargetValue>;
} & ChildrenProp): JSXElement;
/**
 * Renders its children into the document head.
 */
export declare function Helmet(props: ChildrenProp): JSXElement;
//#endregion
export { ChildrenProp, Cleanup, Content, CoreIntrinsicElements, Fragment, JSXElement, JSXParent, JSXSibling, MaybeReactive, REACTIVE, Reactive, RefProp, createElement, createMarker, emptyElement, isReactive, moveNode, setRef, subscribe, textNode };