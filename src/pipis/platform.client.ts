/// <reference lib="dom" />

// The browser's platform: nodes are the document's own. This is what `pipis` is unless the bundler is told it is a server
// (the `pipis-server` condition of the `#platform` import in package.json).
import { type Cleanup, type Content, type JSXElement, type Reactive, isReactive, moveNode, subscribe } from './base.ts';
import { ATTRIBUTE_PROP, type PropValue, isEmpty, setText } from './internal.ts';

/** Whether the code runs in a browser. `true` here and `false` in the server's build, a constant either way, so what depends on it is removed from the build that cannot use it. */
export const IS_CLIENT: boolean = true;

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

/** Where `Helmet` renders. @internal */
export const head = (): Node => document.head;

/** Sets a prop of an element, or of its `style`. The DOM wants some as attributes and some as properties. @internal */
export function setAttribute(target: Element | CSSStyleDeclaration, key: string, value: PropValue) {
  if (target instanceof SVGElement || (target instanceof Element && ATTRIBUTE_PROP.test(key))) {
    // Not `dataset`: it wants camelCase names and throws for a dashed one such as `data-multi-word`.
    // Setting the value to null or undefined would leave the attribute there, so it has to be removed.
    if (isEmpty(value)) {
      target.removeAttribute(key);
    } else {
      target.setAttribute(key, String(value));
    }
  } else {
    // A property that is given nothing (`null` or `undefined`) is assigned the empty string, and its attribute is taken off. Assigned as it is,
    // the DOM would write the text 'undefined' or 'null' for most of them, and the empty string alone would leave an attribute that is there
    // and empty (a `href` that is the page, a `tabindex` of 0). `false` is a value: `draggable` and `spellcheck` are `"false"` in the DOM.
    const nothing = value == null;
    // oxlint-disable-next-line typescript/consistent-type-assertions -- the key is a prop name, so which property it is depends on the props, and `Element` has no index
    (target as unknown as Record<string, unknown>)[key] = nothing ? '' : value;
    // The attribute is the property's name in lowercase (`tabIndex` is `tabindex`), but for two of them. (The ARIA properties, `ariaLabel`, are
    // not: the attribute form, `aria-label`, is the one that takes nothing as no attribute.)
    if (nothing && target instanceof Element)
      target.removeAttribute(key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key.toLowerCase());
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Makes the element for a tag. The namespace is found by asking for an HTML element first: a tag that HTML does not know is created as
 * SVG. So a tag that is neither (a typo that got past the types) is an `SVGElement`, not the `HTMLUnknownElement` one would expect, and
 * a MathML tag is not given the MathML namespace, because every MathML element has the one class and nothing tells it from an unknown tag.
 * @internal
 */
export function createNode(type: string): Element {
  const element = document.createElement(type);
  // SVG has no 'unknown element' class to ask for, but HTML does, so SVG is whatever HTML does not know. (A custom element name,
  // such as `my-widget`, is a plain HTMLElement and stays HTML.)
  return element instanceof HTMLUnknownElement ? document.createElementNS(SVG_NS, type) : element;
}
