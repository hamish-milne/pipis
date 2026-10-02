//#region src/pipis/core.d.ts
/** Brand symbol used to identify {@link Reactive} values at runtime; see {@link isReactive}. */
declare const REACTIVE: unique symbol;
/** Unsubscribes from a {@link Reactive} value, or tears down an effect/binding. Safe to call more than once. */
type Cleanup = () => void;
/**
 * A value that can be observed for changes. Implement this interface to bind a custom state
 * management solution (e.g. a store with its own `subscribe` method) into pipis.
 */
type Reactive<T> = {
  readonly [REACTIVE]: true;
  /** Registers `callback` to be invoked with the current value immediately, and again on every change. */
  subscribe(callback: (newValue: T) => void): Cleanup;
};
/** An alternative to directly calling `subscribe` on a {@link Reactive} value, purely to optimize bundle size. */
declare function subscribe<T>(reactive: Reactive<T>, callback: (value: T) => void): Cleanup;
type MaybeReactive<T> = Reactive<T> | T;
/** Runtime type guard for {@link Reactive} values, based on the {@link REACTIVE} brand. */
declare const isReactive: <T>(value: unknown) => value is Reactive<T>;
type JSXParent = Node | undefined;
type JSXSibling = Node | null;
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
type JSXElement = (parent?: JSXParent, sibling?: JSXSibling) => Node | null;
/** A child that renders as a DOM text node: any other primitive value is stringified, `null`/`undefined` render as empty. */
type Content = string | number | false | null | undefined;
type JSXChild = JSXElement | Content | Reactive<Content>;
type JSXChildArray = readonly JSXChild[];
/** Props shape accepted by any element that can take JSX children. */
type ChildrenProp = {
  readonly children?: JSXChild | JSXChildArray;
};
/** Props shape for the `ref` prop, accepted by every intrinsic element. */
type RefProp<T> = {
  readonly ref?: ((instance: T) => void) | {
    set value(_: T | null | undefined);
  };
};
/** A {@link JSXElement} that renders nothing; on mount, returns `sibling` unchanged. */
declare const emptyElement: JSXElement;
/**
 * Renders a `<>...</>` fragment: a sequence of children with no wrapping DOM node.
 * Collapses to the child itself (or {@link emptyElement}) when there are 0 or 1 children,
 * so it adds no overhead - and no extra stack frame - for the common case.
 *
 * Because of these optimizations, Fragments only support a static list of children. If
 * the structure should be dynamic, consider {@link List}, {@link ReactiveChildren}, or other
 * dynamic rendering utilities.
 */
declare function Fragment({ children }: ChildrenProp): JSXElement;
/**
 * Moves a node to a different position in the DOM, if needed.
 */
declare function moveNode(element: ChildNode, parent: JSXParent, sibling?: JSXSibling): boolean;
/**
 * Creates a text node that can reactively update its content if given a reactive value.
 */
declare function textNode(content: Content | Reactive<Content>): JSXElement;
/**
 * Creates a `Comment` node to use as a stable anchor point in the DOM. Useful for implementing
 * elements whose content can change shape over time - mount the marker once as the element's
 * fixed head, and insert/remove/reorder actual content around it as needed.
 */
declare const createMarker: (text?: string) => Comment;
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
type CoreIntrinsicElements = { [K in keyof AllElements]: IntrinsicElement<AllElements[K]>; };
/** Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object. */
declare function setRef<T>(props: RefProp<T>, value: T): void;
/**
 * Renders an intrinsic (HTML/SVG/MathML tag) element. Static props are set once at construction;
 * {@link Reactive} props are subscribed on mount and unsubscribed on unmount. The underlying DOM
 * node is created once and reused across mount/unmount/remount calls.
 */
declare function createElement<T extends keyof CoreIntrinsicElements>(type: T, props: CoreIntrinsicElements[T]): JSXElement;
//#endregion
export { moveNode as _, Fragment as a, textNode as b, JSXSibling as c, Reactive as d, RefProp as f, isReactive as g, emptyElement as h, CoreIntrinsicElements as i, MaybeReactive as l, createMarker as m, Cleanup as n, JSXElement as o, createElement as p, Content as r, JSXParent as s, ChildrenProp as t, REACTIVE as u, setRef as v, subscribe as y };