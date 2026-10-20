/// <reference lib="dom" />

import type { SVGElementAttributeMap } from './svg.ts';
import {
  type ChildrenProp,
  type Cleanup,
  type JSXChild,
  type JSXChildArray,
  type JSXElement,
  type Reactive,
  type RefProp,
  isReactive,
  moveNode,
  setRef,
  subscribe,
} from './base.ts';
import type { PropBag, PropValue } from './internal.ts';
import { IS_CLIENT, createNode, setAttribute, textNode } from '#platform';

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
 * the structure should be dynamic, use `If`, `OneOf`, `List`, `ReactiveList` or `Dynamic`.
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
  const element = createNode(type);
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
  // A ref is the page's way to reach a node it has put on the screen: there is no screen on a server, so nothing is given to it there.
  if (IS_CLIENT) setRef(props, element);
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
