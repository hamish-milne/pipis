//#region src/pipis/core.d.ts
/** Brand symbol used to identify {@link Reactive} values at runtime; see {@link isReactive}. */
export declare const REACTIVE: unique symbol;
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
export declare function subscribe<T>(reactive: Reactive<T>, callback: (value: T) => void): Cleanup;
export type MaybeReactive<T> = Reactive<T> | T;
/** Runtime type guard for {@link Reactive} values, based on the {@link REACTIVE} brand. */
export declare const isReactive: <T>(value: unknown) => value is Reactive<T>;
export type JSXParent = Node | undefined;
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
type JSXChild = JSXElement | Content | Reactive<Content>;
type JSXChildArray = readonly JSXChild[];
/** Props shape accepted by any element that can take JSX children. */
export type ChildrenProp = {
  readonly children?: JSXChild | JSXChildArray;
};
/** Props shape for the `ref` prop, accepted by every intrinsic element. */
export type RefProp<T> = {
  readonly ref?: ((instance: T) => void) | {
    set value(_: T | null | undefined);
  };
};
/** A {@link JSXElement} that renders nothing; on mount, returns `sibling` unchanged. */
export declare const emptyElement: JSXElement;
/**
 * Renders a `<>...</>` fragment: a sequence of children with no wrapping DOM node.
 * Collapses to the child itself (or {@link emptyElement}) when there are 0 or 1 children,
 * so it adds no overhead - and no extra stack frame - for the common case.
 *
 * Because of these optimizations, Fragments only support a static list of children. If
 * the structure should be dynamic, consider {@link List}, {@link ReactiveChildren}, or other
 * dynamic rendering utilities.
 */
export declare function Fragment({ children }: ChildrenProp): JSXElement;
/**
 * Moves a node to a different position in the DOM, if needed.
 */
export declare function moveNode(element: ChildNode, parent: JSXParent, sibling?: JSXSibling): boolean;
/**
 * Creates a text node that can reactively update its content if given a reactive value.
 */
export declare function textNode(content: Content | Reactive<Content>): JSXElement;
/**
 * Creates a `Comment` node to use as a stable anchor point in the DOM. Useful for implementing
 * elements whose content can change shape over time - mount the marker once as the element's
 * fixed head, and insert/remove/reorder actual content around it as needed.
 */
export declare const createMarker: (text?: string) => Comment;
type StripReadonly<T> = { [K in keyof T as Equals<Pick<T, K>, Readonly<Pick<T, K>>> extends true ? never : K]: T[K]; };
type Equals<A, B> = (<Y>() => Y extends B ? 1 : 2) extends (<Y>() => (Y extends A ? 1 : 2)) ? true : false;
type StripMethods<T> = { [K in keyof T as T[K] extends Function ? never : K]: T[K]; };
type EventHandlerWithTarget<TEventHandler, TTarget extends EventTarget> = TEventHandler extends ((this: infer TThis, ev: infer TEvent) => any) ? (this: TThis, ev: TEvent & {
  target: TTarget;
}) => void : TEventHandler;
type ValueOrBinding<T> = T | Reactive<T>;
type ConvertIntrinsicProps<T, TTarget extends EventTarget> = { [K in keyof T]?: ValueOrBinding<EventHandlerWithTarget<T[K], TTarget>>; };
type AllElements = HTMLElementTagNameMap & Omit<SVGElementTagNameMap, "a"> & MathMLElementTagNameMap;
type IntrinsicElement<T extends Node> = ConvertIntrinsicProps<StripReadonly<StripMethods<T>>, T> & ChildrenProp & RefProp<T>;
/** The JSX props type for every built-in HTML/SVG/MathML tag, derived from the DOM lib types. */
export type IntrinsicElements = { [K in keyof AllElements]: IntrinsicElement<AllElements[K]>; };
/** Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object. */
export declare function setRef<T>(props: RefProp<T>, value: T): void;
/**
 * Renders an intrinsic (HTML/SVG/MathML tag) element. Static props are set once at construction;
 * {@link Reactive} props are subscribed on mount and unsubscribed on unmount. The underlying DOM
 * node is created once and reused across mount/unmount/remount calls.
 */
export declare function createElement<T extends keyof IntrinsicElements>(type: T, props: IntrinsicElements[T]): JSXElement;
//#endregion
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