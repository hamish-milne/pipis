//#region src/pipis/svg.d.ts
interface SVGGlobalAttributes {
  id?: string;
  class?: string;
  tabindex?: string | number;
  lang?: string;
  role?: string;
  style?: string;
  "data-*"?: string;
  [key: `data-${string}`]: string | undefined;
}
interface SVGPresentationAttributes {
  "alignment-baseline"?: string;
  "clip-path"?: string;
  "clip-rule"?: string;
  color?: string;
  cursor?: string;
  direction?: string;
  display?: string;
  "dominant-baseline"?: string;
  fill?: string;
  "fill-opacity"?: string | number;
  "fill-rule"?: "nonzero" | "evenodd" | "inherit";
  filter?: string;
  "font-family"?: string;
  "font-size"?: string | number;
  "font-style"?: string;
  "font-weight"?: string | number;
  "letter-spacing"?: string | number;
  mask?: string;
  opacity?: string | number;
  overflow?: string;
  "pointer-events"?: string;
  stroke?: string;
  "stroke-dasharray"?: string | number;
  "stroke-dashoffset"?: string | number;
  "stroke-linecap"?: "butt" | "round" | "square" | "inherit";
  "stroke-linejoin"?: "miter" | "round" | "bevel" | "inherit";
  "stroke-miterlimit"?: string | number;
  "stroke-opacity"?: string | number;
  "stroke-width"?: string | number;
  "text-anchor"?: "start" | "middle" | "end" | "inherit";
  "text-decoration"?: string;
  transform?: string;
  "transform-origin"?: string;
  vector_effect?: "none" | "non-scaling-stroke" | "non-scaling-size" | "non-rotation" | "fixed-position";
  visibility?: "visible" | "hidden" | "collapse" | "inherit";
  "writing-mode"?: string;
}
interface SVGGraphicsElementAttributes extends SVGGlobalAttributes, SVGPresentationAttributes {}
interface SVGContainerElementAttributes extends SVGGraphicsElementAttributes {}
interface SVGTextContentElementAttributes extends SVGGraphicsElementAttributes {
  dx?: string | number;
  dy?: string | number;
  x?: string | number;
  y?: string | number;
}
interface SVGAElementAttributes extends SVGContainerElementAttributes {
  href?: string;
  target?: string;
  download?: string;
  rel?: string;
}
interface SVGCircleElementAttributes extends SVGGraphicsElementAttributes {
  cx?: string | number;
  cy?: string | number;
  r?: string | number;
}
interface SVGClipPathElementAttributes extends SVGGlobalAttributes {
  clipPathUnits?: "userSpaceOnUse" | "objectBoundingBox";
}
interface SVGDefsElementAttributes extends SVGContainerElementAttributes {}
interface SVGEllipseElementAttributes extends SVGGraphicsElementAttributes {
  cx?: string | number;
  cy?: string | number;
  rx?: string | number;
  ry?: string | number;
}
interface SVGFilterElementAttributes extends SVGGlobalAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  filterUnits?: "userSpaceOnUse" | "objectBoundingBox";
  primitiveUnits?: "userSpaceOnUse" | "objectBoundingBox";
}
interface SVGGElementAttributes extends SVGContainerElementAttributes {}
interface SVGImageElementAttributes extends SVGGraphicsElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  href?: string;
  preserveAspectRatio?: string;
}
interface SVGLineElementAttributes extends SVGGraphicsElementAttributes {
  x1?: string | number;
  y1?: string | number;
  x2?: string | number;
  y2?: string | number;
}
interface SVGLinearGradientElementAttributes extends SVGGlobalAttributes {
  x1?: string | number;
  y1?: string | number;
  x2?: string | number;
  y2?: string | number;
  gradientUnits?: "userSpaceOnUse" | "objectBoundingBox";
  gradientTransform?: string;
  spreadMethod?: "pad" | "reflect" | "repeat";
  href?: string;
}
interface SVGMaskElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  maskUnits?: "userSpaceOnUse" | "objectBoundingBox";
  maskContentUnits?: "userSpaceOnUse" | "objectBoundingBox";
}
interface SVGPathElementAttributes extends SVGGraphicsElementAttributes {
  d?: string;
  pathLength?: string | number;
}
interface SVGPatternElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  patternUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternContentUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternTransform?: string;
  viewBox?: string;
  preserveAspectRatio?: string;
  href?: string;
}
interface SVGPolygonElementAttributes extends SVGGraphicsElementAttributes {
  points?: string;
}
interface SVGPolylineElementAttributes extends SVGGraphicsElementAttributes {
  points?: string;
}
interface SVGRadialGradientElementAttributes extends SVGGlobalAttributes {
  cx?: string | number;
  cy?: string | number;
  r?: string | number;
  fx?: string | number;
  fy?: string | number;
  fr?: string | number;
  gradientUnits?: "userSpaceOnUse" | "objectBoundingBox";
  gradientTransform?: string;
  spreadMethod?: "pad" | "reflect" | "repeat";
  href?: string;
}
interface SVGRectElementAttributes extends SVGGraphicsElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  rx?: string | number;
  ry?: string | number;
}
interface SVGSVGElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  viewBox?: string;
  preserveAspectRatio?: string;
  xmlns?: string;
}
interface SVGStopElementAttributes extends SVGGlobalAttributes, SVGPresentationAttributes {
  offset?: string | number;
  "stop-color"?: string;
  "stop-opacity"?: string | number;
}
interface SVGSymbolElementAttributes extends SVGContainerElementAttributes {
  viewBox?: string;
  preserveAspectRatio?: string;
  refX?: string | number;
  refY?: string | number;
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
}
interface SVGTextElementAttributes extends SVGTextContentElementAttributes {
  rotate?: string | number;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
  textLength?: string | number;
}
interface SVGTSpanElementAttributes extends SVGTextContentElementAttributes {
  rotate?: string | number;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
  textLength?: string | number;
}
interface SVGUseElementAttributes extends SVGGraphicsElementAttributes {
  href?: string;
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
}
interface SVGElementAttributeMap {
  a: SVGAElementAttributes;
  circle: SVGCircleElementAttributes;
  clipPath: SVGClipPathElementAttributes;
  defs: SVGDefsElementAttributes;
  ellipse: SVGEllipseElementAttributes;
  filter: SVGFilterElementAttributes;
  g: SVGGElementAttributes;
  image: SVGImageElementAttributes;
  line: SVGLineElementAttributes;
  linearGradient: SVGLinearGradientElementAttributes;
  mask: SVGMaskElementAttributes;
  path: SVGPathElementAttributes;
  pattern: SVGPatternElementAttributes;
  polygon: SVGPolygonElementAttributes;
  polyline: SVGPolylineElementAttributes;
  radialGradient: SVGRadialGradientElementAttributes;
  rect: SVGRectElementAttributes;
  stop: SVGStopElementAttributes;
  svg: SVGSVGElementAttributes;
  symbol: SVGSymbolElementAttributes;
  text: SVGTextElementAttributes;
  tspan: SVGTSpanElementAttributes;
  use: SVGUseElementAttributes;
}
//#endregion
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
type JSXChildArray = readonly (JSXChild | JSXChildArray)[];
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
type NestedKey = "style";
type NestedBinding<T> = { readonly [K in keyof T]?: ValueOrBinding<T[K]>; };
type ConvertIntrinsicProps<T, TTarget extends EventTarget> = { readonly [K in keyof T]?: K extends NestedKey ? NestedBinding<T[K]> : ValueOrBinding<EventHandlerWithTarget<T[K], TTarget>>; };
type AllElements = HTMLElementTagNameMap & Omit<SVGElementTagNameMap, "a"> & MathMLElementTagNameMap;
type IntrinsicElement<T extends Node, Tag extends string> = ConvertIntrinsicProps<StripReadonly<StripMethods<T>>, T> & ChildrenProp & RefProp<T> & (Tag extends keyof SVGElementAttributeMap ? SVGElementAttributeMap[Tag] : {});
/** The JSX props type for every built-in HTML/SVG/MathML tag, derived from the DOM lib types. */
type CoreIntrinsicElements = { [K in keyof AllElements]: IntrinsicElement<AllElements[K], K>; };
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