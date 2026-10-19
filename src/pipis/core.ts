/// <reference lib="dom" />

import type { SVGElementAttributeMap } from './svg.ts';

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
// oxlint-disable-next-line typescript/consistent-type-assertions -- the brand is read off any value at all, which is the check that makes it a Reactive; narrowing to read it costs 19 bytes in every app
export const isReactive = <T>(value: unknown): value is Reactive<T> => (value as Reactive<T> | null)?.[REACTIVE] === true;

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
type JSXChildArray = readonly (JSXChild | JSXChildArray)[];

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

// `Array.isArray` does not narrow a readonly array, which is what a list of children is.
const isChildArray = (child: JSXChild | JSXChildArray | undefined): child is JSXChildArray => Array.isArray(child);

/** Turns a child, or arrays of children nested to any depth, into elements: nothing for `null`, `undefined` and `false`, text for the rest. */
function collectChildren(child: JSXChild | JSXChildArray | undefined, into: JSXElement[]) {
  if (isChildArray(child)) {
    for (const nested of child) collectChildren(nested, into);
  } else if (child != null && child !== false) {
    into.push(typeof child === 'function' ? child : textNode(child));
  }
}

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
  const childElements: JSXElement[] = [];
  collectChildren(children, childElements);
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

/** Whether a value stands for "nothing": `null`, `undefined` and `false` render as empty text and remove a `data-*` attribute. */
function isEmpty(value: unknown): value is null | undefined | false {
  return value == null || value === false;
}

function setText(node: Text, content: Content) {
  node.data = isEmpty(content) ? '' : String(content);
}

/**
 * Creates a text node that can reactively update its content if given a reactive value.
 */
export function textNode(content: Content | Reactive<Content>): JSXElement {
  const node = document.createTextNode('');
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
export const createMarker = (text: string = ''): Comment => document.createComment(text);

type StripReadonly<T> = {
  [K in keyof T as Equals<Pick<T, K>, Readonly<Pick<T, K>>> extends true ? never : K]: T[K];
};

type Equals<A, B> = (<Y>() => Y extends B ? 1 : 2) extends <Y>() => Y extends A ? 1 : 2 ? true : false;

// Also drops index signatures: `HTMLFormElement` has `[name: string]: any` (for its named controls), which would make every
// misspelt prop on a `<form>`, such as React's `onSubmit`, type-check.
type StripMethods<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : T[K] extends Function ? never : K]: T[K];
};

type EventHandlerWithTarget<TEventHandler, TTarget extends EventTarget> = TEventHandler extends (
  this: infer TThis,
  ev: infer TEvent,
) => unknown
  ? (this: TThis, ev: TEvent & { target: TTarget }) => void
  : TEventHandler;

type ValueOrBinding<T> = T | Reactive<T>;

// Bindings to these props should be treated as nested objects, allowing reactive updates to their individual properties.
type NestedKey = 'style';

type NestedBinding<T> = {
  readonly [K in keyof T]?: ValueOrBinding<T[K]>;
};

type ConvertIntrinsicProps<T, TTarget extends EventTarget> = {
  readonly [K in keyof T]?: K extends NestedKey ? NestedBinding<T[K]> : ValueOrBinding<EventHandlerWithTarget<T[K], TTarget>>;
};

type AllElements = HTMLElementTagNameMap & Omit<SVGElementTagNameMap, 'a'> & MathMLElementTagNameMap;

type IntrinsicElement<T extends Node, Tag extends string> = ConvertIntrinsicProps<StripReadonly<StripMethods<T>>, T> &
  ChildrenProp &
  RefProp<T> &
  (Tag extends keyof SVGElementAttributeMap ? SVGElementAttributeMap[Tag] : {});

/** The JSX props type for every built-in HTML/SVG/MathML tag, derived from the DOM lib types. */
export type CoreIntrinsicElements = {
  [K in keyof AllElements]: IntrinsicElement<AllElements[K], K>;
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

/** What a prop can hold once it is not reactive: anything the DOM coerces to a string, or a value it takes as it is. */
type PropValue = string | number | boolean | null | undefined;

// The props are read by name, and their type is the union of every element's props, so there is nothing narrower to say here.
// oxlint-disable-next-line typescript/no-explicit-any
type PropBag = Record<string, any>;

function setAttribute(element: Element | CSSStyleDeclaration, key: string, value: PropValue) {
  if (element instanceof SVGElement || (element instanceof Element && key.startsWith('data-'))) {
    // Not `dataset`: it wants camelCase names and throws for a dashed one such as `data-multi-word`.
    // Setting the value to null or undefined would leave the attribute there, so it has to be removed.
    if (isEmpty(value)) {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
    }
  } else {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the key is a prop name, so which property it is depends on the props, and `Element` has no index
    (element as unknown as Record<string, unknown>)[key] = value;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

type BindingEntry = [obj: Element | CSSStyleDeclaration, key: string, reactive: Reactive<PropValue>, cleanup: Cleanup | null];
/**
 * Renders an intrinsic HTML or SVG element. Static props are set once at construction;
 * {@link Reactive} props are subscribed on mount and unsubscribed on unmount. The underlying DOM
 * node is created once and reused across mount/unmount/remount calls.
 *
 * The namespace is found by asking for an HTML element first: a tag that HTML does not know is created as SVG. So a tag that is
 * neither (a typo that got past the types) is an `SVGElement`, not the `HTMLUnknownElement` one would expect, and a MathML tag
 * is not given the MathML namespace, because every MathML element has the one class and nothing tells it from an unknown tag.
 */
export function createElement<T extends keyof CoreIntrinsicElements>(type: T, props: CoreIntrinsicElements[T]): JSXElement;

// The implementation reads the props by name, and which element it makes depends on the tag at run time, so there is nothing narrower
// to say here than the DOM's own `Element`: the overload above is the typed face of it.
export function createElement(type: string, props: PropBag): JSXElement {
  let element: Element = document.createElement(type);
  // SVG has no 'unknown element' class to ask for, but HTML does, so SVG is whatever HTML does not know. (A custom element name,
  // such as `my-widget`, is a plain HTMLElement and stays HTML.)
  if (element instanceof HTMLUnknownElement) {
    element = document.createElementNS(SVG_NS, type);
  }
  const bindings: BindingEntry[] = [];

  const addBinding = (obj: Element | CSSStyleDeclaration, value: PropValue | Reactive<PropValue>, key: string) => {
    if (isReactive(value)) {
      bindings.push([obj, key, value, null]);
    } else {
      setAttribute(obj, key, value);
    }
  };

  for (const key in props) {
    if (key === 'children' || key === 'ref') {
      continue;
    }
    const value = props[key];
    if (key === 'style') {
      // `style` is on HTML and SVG elements but not on `Element`, which is all the DOM says an element made by tag name is.
      // oxlint-disable-next-line typescript/consistent-type-assertions -- `Element` has no `style`; the HTML and SVG elements that props can name it for do
      const obj = (element as HTMLElement).style;
      const styles: PropBag = value;
      for (const nestedKey in styles) {
        addBinding(obj, styles[nestedKey], nestedKey);
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
      // On unmount the children are unmounted too, which is what runs their cleanups and ends their subscriptions.
      children(parent && element);
    }
    return parent ? element : sibling;
  };
}
