/// <reference lib="dom" />

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

export type MaybeReactive<T> = Reactive<T> | T;

/** Runtime type guard for {@link Reactive} values, based on the {@link REACTIVE} brand. */
export const isReactive = <T>(value: unknown): value is Reactive<T> =>
  (value as Reactive<T> | null)?.[REACTIVE] === true;

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
  // `value` should be contravariant as it's write-only, but this isn't properly handled in TypeScript yet.
  readonly ref?: ((instance: T) => void) | { set value(_: T | null | undefined) };
};

/** A {@link JSXElement} that renders nothing; on mount, returns `sibling` unchanged. */
export const emptyElement: JSXElement = (parent, sibling = null) => sibling;

/**
 * Renders a `<>...</>` fragment: a sequence of children with no wrapping DOM node.
 * Collapses to the child itself (or {@link emptyElement}) when there are 0 or 1 children,
 * so it adds no overhead - and no extra stack frame - for the common case.
 *
 * Because of these optimizations, Fragments only support a static list of children. If
 * the structure should be dynamic, consider {@link List}, {@link ReactiveChildren}, or other
 * dynamic rendering utilities.
 */
export function Fragment({ children }: ChildrenProp): JSXElement {
  let childElements: JSXElement[] = [];
  for (const child of children instanceof Array ? children : [children]) {
    if (child != null && child !== false) {
      childElements.push(typeof child === "function" ? child : textNode(child));
    }
  }
  childElements.reverse();
  if (childElements.length <= 1) {
    return childElements[0] ?? emptyElement;
  }
  return function Fragment_element(parent, sibling = null) {
    let head = sibling;
    for (const child of childElements) {
      head = child(parent, head);
    }
    return head;
  };
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

function setText(node: Text, content: Content) {
  node.data = String(content ?? "");
}

/**
 * Creates a text node that can reactively update its content if given a reactive value.
 */
export function textNode(content: Content | Reactive<Content>): JSXElement {
  const node = document.createTextNode("");
  let contentReactive: Reactive<Content> | undefined;
  if (isReactive(content)) {
    contentReactive = content;
  } else {
    setText(node, content);
  }
  let cleanup: Cleanup | undefined;
  return function textNode_element(parent, sibling = null) {
    if (parent) {
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
 * Creates a `Comment` node to use as a stable anchor point in the DOM. Useful for implementing
 * elements whose content can change shape over time - mount the marker once as the element's
 * fixed head, and insert/remove/reorder actual content around it as needed.
 */
export const createMarker = (text: string = ""): Comment => document.createComment(text);

type StripReadonly<T> = {
  [K in keyof T as Equals<Pick<T, K>, Readonly<Pick<T, K>>> extends true ? never : K]: T[K];
};

type Equals<A, B> =
  (<Y>() => Y extends B ? 1 : 2) extends <Y>() => Y extends A ? 1 : 2 ? true : false;

type StripMethods<T> = {
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

type EventHandlerWithTarget<TEventHandler, TTarget extends EventTarget> = TEventHandler extends (
  this: infer TThis,
  ev: infer TEvent,
) => any
  ? (this: TThis, ev: TEvent & { target: TTarget }) => void
  : TEventHandler;

type ValueOrBinding<T> = T | Reactive<T>;

// Bindings to these props should be treated as nested objects, allowing reactive updates to their individual properties.
type NestedKey = "style";

type NestedBinding<T> = {
  readonly [K in keyof T]?: ValueOrBinding<T[K]>;
};

type ConvertIntrinsicProps<T, TTarget extends EventTarget> = {
  readonly [K in keyof T]?: K extends NestedKey
    ? NestedBinding<T[K]>
    : ValueOrBinding<EventHandlerWithTarget<T[K], TTarget>>;
};

type AllElements = HTMLElementTagNameMap &
  Omit<SVGElementTagNameMap, "a"> &
  MathMLElementTagNameMap;

type IntrinsicElement<T extends Node> = ConvertIntrinsicProps<StripReadonly<StripMethods<T>>, T> &
  ChildrenProp &
  RefProp<T>;

/** The JSX props type for every built-in HTML/SVG/MathML tag, derived from the DOM lib types. */
export type CoreIntrinsicElements = {
  [K in keyof AllElements]: IntrinsicElement<AllElements[K]>;
};

/** Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object. */
export function setRef<T>(props: RefProp<T>, value: T) {
  const { ref } = props;
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.value = value;
  }
}

function setAttribute(element: unknown, key: string, value: any) {
  if (key.startsWith("data-")) {
    const { dataset } = element as HTMLOrSVGElement;
    const name = key.slice(5);
    // It's not enough to set the value to null/undefined; you have to actually delete the property
    if (value == null || value === false) {
      delete dataset[name];
    } else {
      dataset[name] = value;
    }
  } else {
    (element as any)[key] = value;
  }
}

const NS_PREFIX = "http://www.w3.org/";
const NAMESPACES: [string, { prototype: object } | null][] = [
  [NS_PREFIX + "1999/xhtml", HTMLUnknownElement],
  [NS_PREFIX + "2000/svg", SVGElement],
  [NS_PREFIX + "1998/Math/MathML", MathMLElement],
];
// Fall back to HTML, and always accept the result (it will be HTMLUnknownElement)
NAMESPACES[3] = [NAMESPACES[0][0], null];

type BindingEntry = [
  obj: unknown,
  key: string,
  reactive: Reactive<unknown>,
  cleanup: Cleanup | null,
];
/**
 * Renders an intrinsic (HTML/SVG/MathML tag) element. Static props are set once at construction;
 * {@link Reactive} props are subscribed on mount and unsubscribed on unmount. The underlying DOM
 * node is created once and reused across mount/unmount/remount calls.
 */
export function createElement<T extends keyof CoreIntrinsicElements>(
  type: T,
  props: CoreIntrinsicElements[T],
): JSXElement {
  let element!: AllElements[T];
  for (const [ns, invalid] of NAMESPACES) {
    element = document.createElementNS(ns, type) as AllElements[T];
    // We have to do this instead of intanceof because SVG and MathML have no 'unknown' element type to check against
    if (Object.getPrototypeOf(element) === invalid?.prototype) {
      break;
    }
  }
  const bindings: BindingEntry[] = [];

  const addBinding = (obj: unknown, value: any, key: string) => {
    if (isReactive(value)) {
      bindings.push([obj, key, value, null]);
    } else {
      setAttribute(element, key, value);
    }
  };

  for (const key in props) {
    if (key === "children" || key === "ref") {
      continue;
    }
    const value = (props as any)[key];
    if (key === "style") {
      const obj = element[key as NestedKey];
      for (const nestedKey in value) {
        addBinding(obj, (value as any)[nestedKey], nestedKey);
      }
    } else {
      addBinding(element, value, key);
    }
  }
  setRef(props, element);
  const children = Fragment(props);
  return function jsxIntrinsic_element(parent, sibling = null) {
    if (moveNode(element, parent, sibling)) {
      if (parent) {
        for (const b of bindings) {
          const [obj, key, reactive] = b;
          b[3] ??= subscribe(reactive, function jsxIntrinsic_binding(newValue) {
            setAttribute(obj, key, newValue);
          });
        }
      } else {
        for (const b of bindings) {
          b[3]?.();
          b[3] = null;
        }
      }
      children(element);
    }
    return parent ? element : sibling;
  };
}
