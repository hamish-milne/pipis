/// <reference lib="dom" />

// The server's platform: nodes that are not the document's. They are objects with the parts of the DOM that the library uses (a parent,
// siblings, children, attributes), and the markup of a render is read off them. There is no `document` here, and no global is touched,
// so a render cannot disturb the process it is in. Which of this and platform.client.ts an app gets is the bundler's choice (see
// docs/adr/0019-server-rendering.md); `pipis/server` is what turns an element into HTML.
//
// What this must do is what the browser build does, as far as markup goes, and `tools/server.test.ts` holds it to that against jsdom.
import { type Content, type JSXElement, type Reactive, isReactive, moveNode, subscribe } from './base.ts';
import { ATTRIBUTE_PROP, type PropValue, isEmpty, setText } from './internal.ts';
import { HTML_TAGS, RAW_TEXT_TAGS, REFLECTED, VOID_TAGS } from './reflect.ts';

/** Whether the code runs in a browser: `false` here, a constant, so what is only for a browser is removed from the server's build. */
export const IS_CLIENT: boolean = false;

class ServerNode {
  parentNode: ServerParent | null = null;
  nextSibling: ServerNode | null = null;
  previousSibling: ServerNode | null = null;
}

/** Takes a node out of its parent, if it has one. */
function detach(node: ServerNode) {
  const parent = node.parentNode;
  if (!parent) return;
  if (node.previousSibling) node.previousSibling.nextSibling = node.nextSibling;
  else parent.firstChild = node.nextSibling;
  if (node.nextSibling) node.nextSibling.previousSibling = node.previousSibling;
  else parent.lastChild = node.previousSibling;
  node.parentNode = node.nextSibling = node.previousSibling = null;
}

/** A node with children, as a linked list: moving a node costs the same however long the list is. */
class ServerParent extends ServerNode {
  firstChild: ServerNode | null = null;
  lastChild: ServerNode | null = null;

  insertBefore<T extends ServerNode>(node: T, before: ServerNode | null): T {
    // Inserting a node before itself leaves it where it is.
    const next = before === node ? node.nextSibling : before;
    if (next && next.parentNode !== this) throw new Error('The node to insert before is not a child of this node.');
    detach(node);
    node.parentNode = this;
    node.nextSibling = next;
    node.previousSibling = next ? next.previousSibling : this.lastChild;
    if (node.previousSibling) node.previousSibling.nextSibling = node;
    else this.firstChild = node;
    if (next) next.previousSibling = node;
    else this.lastChild = node;
    return node;
  }

  removeChild<T extends ServerNode>(node: T): T {
    if (node.parentNode !== this) throw new Error('The node to remove is not a child of this node.');
    detach(node);
    return node;
  }

  /** Takes every child out. */
  clear() {
    while (this.firstChild) detach(this.firstChild);
  }
}

class ServerText extends ServerNode {
  data = '';
}

class ServerComment extends ServerNode {
  data: string;
  constructor(data: string) {
    super();
    this.data = data;
  }
}

/** Markup that is written as it is: what `innerHTML` is given. */
class ServerRaw extends ServerNode {
  html: string;
  constructor(html: string) {
    super();
    this.html = html;
  }
}

class ServerStyle {
  owner: ServerElement;
  props = new Map<string, string>();
  constructor(owner: ServerElement) {
    this.owner = owner;
  }
}

class ServerElement extends ServerParent {
  tag: string;
  /** Not HTML: SVG, which is what the browser build makes of a tag that HTML does not know. */
  svg: boolean;
  /** In the order they were first set, as a browser keeps them. */
  attrs = new Map<string, string>();
  style: ServerStyle;
  constructor(tag: string, svg: boolean) {
    super();
    this.tag = tag;
    this.svg = svg;
    this.style = new ServerStyle(this);
  }
}

// The one place a server node is taken for a DOM node. The library reads a parent and its children through the DOM's interface, and these
// have that interface for what it uses, so a render never sees the difference; a ref is not given one (see `createElement`).
// oxlint-disable-next-line typescript/consistent-type-assertions -- written once, here: the server's nodes stand in for the DOM's
const asDom = <T>(node: ServerNode) => node as unknown as T;

const HTML = new Set(HTML_TAGS);
const VOID = new Set(VOID_TAGS);
const RAW_TEXT = new Set(RAW_TEXT_TAGS);

/** Creates a text node that can reactively update its content if given a reactive value. The same as the browser build's, over this platform's text node. */
export function textNode(content: Content | Reactive<Content>): JSXElement {
  const node = new ServerText();
  let contentReactive: Reactive<Content> | undefined;
  if (isReactive(content)) {
    contentReactive = content;
  } else {
    setText(node, content);
  }
  let cleanup: (() => void) | undefined;
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
    moveNode(asDom(node), parent, sibling);
    return parent ? asDom(node) : sibling;
  };
}

/** Creates a comment node, the stable anchor of a region whose content changes. */
export const createMarker = (text: string = ''): Comment => asDom(new ServerComment(text));

/** The render in progress. Module state, valid while `renderRoot` runs, which is all synchronous: an `await` in a render could let another start. */
let current: { head: ServerElement } | undefined;

/** Where `Helmet` renders: the head of the render in progress. @internal */
export function head(): Node {
  if (!current) throw new Error('Helmet was mounted outside renderToString, which is where a server has a document head.');
  return asDom(current.head);
}

/** Makes the element for a tag. HTML's tags are HTML, as are custom elements; anything else is SVG, as it is in the browser build. @internal */
export function createNode(type: string): Element {
  const tag = type.toLowerCase();
  const html = HTML.has(tag) || tag.indexOf('-') > 0;
  return asDom(new ServerElement(html ? tag : type, !html));
}

const setAttr = (el: ServerElement, name: string, value: string) => el.attrs.set(el.svg ? name : name.toLowerCase(), value);
const removeAttr = (el: ServerElement, name: string) => el.attrs.delete(el.svg ? name : name.toLowerCase());

function setContent(el: ServerElement, text: string) {
  el.clear();
  if (text !== '') {
    const node = new ServerText();
    node.data = text;
    el.insertBefore(node, null);
  }
}

/** The state of a form control is written as the attribute a form is made with: the page starts from it. */
const STATE: Record<string, [attribute: string, boolean: boolean, tags: string[]]> = {
  value: ['value', false, ['input', 'button', 'li', 'option', 'data', 'meter', 'progress', 'param', 'textarea']],
  defaultValue: ['value', false, ['input', 'textarea']],
  checked: ['checked', true, ['input']],
  defaultChecked: ['checked', true, ['input']],
  selected: ['selected', true, ['option']],
  defaultSelected: ['selected', true, ['option']],
};

function setProperty(el: ServerElement, key: string, value: PropValue) {
  const state = STATE[key];
  if (state) {
    // The property is only the element's own on some tags: on any other it is nothing the browser writes.
    if (state[2].indexOf(el.tag) < 0) return;
    const [attribute, isBoolean] = state;
    // A textarea's value is its content. (A select's value is which option has `selected`, which is the option's own prop.)
    if (el.tag === 'textarea' && !isBoolean) setContent(el, value == null ? '' : String(value));
    else if (isBoolean) {
      if (value) setAttr(el, attribute, '');
      else removeAttr(el, attribute);
    } else if (el.tag !== 'select') {
      if (value == null) removeAttr(el, attribute);
      else setAttr(el, attribute, String(value));
    }
    return;
  }
  if (key === 'textContent' || key === 'innerText') {
    setContent(el, String(value ?? ''));
  } else if (key === 'innerHTML') {
    el.clear();
    el.insertBefore(new ServerRaw(String(value ?? '')), null);
  } else {
    const reflected = REFLECTED[key];
    if (!reflected) return;
    const [attribute, kind, tags] = reflected;
    if (tags && tags.indexOf(el.tag) < 0) return;
    if (kind === 'boolean') {
      if (value) setAttr(el, attribute, '');
      else removeAttr(el, attribute);
    } else if (value == null) {
      // A property that is given nothing leaves its attribute out, which is what the browser build does too (see its `setAttribute`).
      // `false` is a value: `draggable` and `spellcheck` are the text "false".
      removeAttr(el, attribute);
    } else {
      // As the DOM converts: a number is whole, and anything else is its text.
      setAttr(el, attribute, kind === 'number' ? String(Math.trunc(Number(value)) || 0) : String(value));
    }
  }
}

/** Sets a prop of an element, or of its `style`, as the browser build's element would show it as markup. @internal */
export function setAttribute(target: Element | CSSStyleDeclaration, key: string, value: PropValue) {
  const node: unknown = target;
  if (node instanceof ServerStyle) {
    if (isEmpty(value) || value === '') {
      node.props.delete(key);
    } else {
      node.props.set(key, String(value));
      // The attribute takes its place among the others when the first property is set.
      if (!node.owner.attrs.has('style')) node.owner.attrs.set('style', '');
    }
  } else if (node instanceof ServerElement) {
    // An event handler is for the browser. (Also anything that is not a function: the property is only a handler when it is one.)
    if (key.startsWith('on')) return;
    if (node.svg || ATTRIBUTE_PROP.test(key)) {
      // The same rule as the browser build: these are attributes, written as they are given, and a missing value takes the attribute off.
      if (isEmpty(value)) removeAttr(node, key);
      else setAttr(node, key, String(value));
    } else {
      setProperty(node, key, value);
    }
  }
}

const TEXT_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\u00a0': '&nbsp;' };
const ATTRIBUTE_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', '\u00a0': '&nbsp;' };

const escapeText = (text: string) => text.replace(/[&<>\u00a0]/g, (c) => TEXT_ESCAPES[c] ?? c);
const escapeAttribute = (text: string) => text.replace(/[&"<>\u00a0]/g, (c) => ATTRIBUTE_ESCAPES[c] ?? c);

/** `backgroundColor` as `background-color`, `webkitTransform` as `-webkit-transform`, `cssFloat` as `float`. */
function cssName(name: string): string {
  if (name === 'cssFloat') return 'float';
  const dashed = name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  return /^(?:webkit|moz|ms|o)-/.test(dashed) ? '-' + dashed : dashed;
}

function styleText(style: ServerStyle): string {
  const parts: string[] = [];
  style.props.forEach((value, name) => parts.push(`${cssName(name)}: ${value};`));
  return parts.join(' ');
}

function openTag(el: ServerElement): string {
  let out = '<' + el.tag;
  el.attrs.forEach((value, name) => {
    const text = name === 'style' ? styleText(el.style) : value;
    // The attribute of a style that has nothing in it is not written.
    if (name !== 'style' || text !== '') out += ` ${name}="${escapeAttribute(text)}"`;
  });
  return out + '>';
}

/** The markup of a node's children. */
function serialize(parent: ServerParent): string {
  const raw = parent instanceof ServerElement && !parent.svg && RAW_TEXT.has(parent.tag);
  let out = '';
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node instanceof ServerText) {
      // A parser drops a newline that starts a `pre`, `textarea` or `listing`, so one that is the text's own has to be written twice.
      const first =
        node === parent.firstChild && parent instanceof ServerElement && !parent.svg && /^(?:pre|textarea|listing)$/.test(parent.tag);
      out += (first && node.data[0] === '\n' ? '\n' : '') + (raw ? node.data : escapeText(node.data));
    } else if (node instanceof ServerComment) {
      out += `<!--${node.data}-->`;
    } else if (node instanceof ServerRaw) {
      out += node.html;
    } else if (node instanceof ServerElement) {
      out += openTag(node);
      if (node.svg || !VOID.has(node.tag)) out += serialize(node) + `</${node.tag}>`;
    }
  }
  return out;
}

/**
 * Mounts an element into a fresh root, reads off its markup and that of the head `Helmet` filled, and unmounts it again, so that nothing
 * it subscribed to is left holding a node. The `pipis/server` entry point is what calls this. @internal
 */
export function renderRoot(element: JSXElement): { html: string; head: string } {
  if (current)
    throw new Error(
      'renderToString was called while another render was in progress: a render is synchronous, so do not await in a component.',
    );
  const state = { head: new ServerElement('head', false) };
  current = state;
  const root = new ServerElement('div', false);
  try {
    element(asDom(root));
    return { html: serialize(root), head: serialize(state.head) };
  } finally {
    try {
      element();
    } finally {
      current = undefined;
    }
  }
}
