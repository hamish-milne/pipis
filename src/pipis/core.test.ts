import { describe, expect, it } from 'vite-plus/test';
import { Fragment, createElement, createMarker, emptyElement, moveNode, setRef, textNode, type JSXElement } from './index.ts';
import { reactive } from './reactive.ts';
import { h, html, mount, realBrowser, tracked } from '../test/dom.ts';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

/** An element that records when it is mounted and unmounted, and renders one comment node. */
function probe(name: string, log: string[]): JSXElement {
  const node = document.createComment(name);
  return (parent, sibling = null) => {
    if (parent) {
      log.push(`mount ${name}`);
      moveNode(node, parent, sibling);
      return node;
    }
    log.push(`unmount ${name}`);
    moveNode(node, undefined);
    return sibling;
  };
}

describe('moveNode', () => {
  it('inserts a node before a sibling, or at the end for null', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('a');
    const b = document.createTextNode('b');
    expect(moveNode(a, parent, null)).toBe(true);
    expect(moveNode(b, parent, a)).toBe(true);
    expect(parent.textContent).toBe('ba');
  });

  it('does nothing, and says so, when the node is already in place', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('a');
    const b = document.createTextNode('b');
    parent.append(a, b);
    expect(moveNode(a, parent, b)).toBe(false);
    expect(moveNode(b, parent, null)).toBe(false);
  });

  it('leaves the position alone when no sibling is given and the parent is the same', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('a');
    const b = document.createTextNode('b');
    parent.append(a, b);
    expect(moveNode(a, parent)).toBe(false);
    expect(parent.textContent).toBe('ab');
  });

  it('moves a node to another parent', () => {
    const from = document.createElement('div');
    const to = document.createElement('div');
    const a = document.createTextNode('a');
    from.append(a);
    expect(moveNode(a, to, null)).toBe(true);
    expect(from.childNodes).toHaveLength(0);
    expect(to.textContent).toBe('a');
  });

  it('removes the node when there is no parent, and does nothing for one that is not attached', () => {
    const parent = document.createElement('div');
    const a = document.createTextNode('a');
    parent.append(a);
    expect(moveNode(a, undefined)).toBe(true);
    expect(parent.childNodes).toHaveLength(0);
    expect(moveNode(a, undefined)).toBe(false);
  });
});

describe('textNode', () => {
  it('renders static content as text', () => {
    const { root } = mount(textNode('hello'));
    expect(root.textContent).toBe('hello');
  });

  it('stringifies numbers and renders null and undefined as empty', () => {
    expect(mount(textNode(42)).root.textContent).toBe('42');
    expect(mount(textNode(0)).root.textContent).toBe('0');
    for (const empty of [null, undefined] as const) {
      const { root } = mount(textNode(empty));
      // The node is still there; it just holds no text.
      expect(root.childNodes).toHaveLength(1);
      expect(root.textContent).toBe('');
    }
  });

  it('renders false as empty, whether static or reactive', () => {
    expect(mount(textNode(false)).root.textContent).toBe('');
    const shown = reactive<string | false>('a');
    const { root } = mount(textNode(shown));
    shown.value = false;
    expect(root.textContent).toBe('');
  });

  it('follows a reactive value once mounted', () => {
    const text = reactive('a');
    const { root } = mount(textNode(text));
    text.value = 'b';
    expect(root.textContent).toBe('b');
    text.value = null as never;
    expect(root.textContent).toBe('');
  });

  it('does not subscribe until it is mounted', () => {
    const text = tracked('a');
    const element = textNode(text.reactive);
    expect(text.active).toBe(0);
    mount(element);
    expect(text.active).toBe(1);
  });

  it('subscribes once however often it is mounted at the same place', () => {
    const text = tracked('a');
    const element = textNode(text.reactive);
    const parent = document.createElement('div');
    element(parent);
    element(parent);
    element(parent, null);
    expect(text.total).toBe(1);
  });

  it('unsubscribes and removes its node on unmount', () => {
    const text = tracked('a');
    const { root, unmount } = mount(textNode(text.reactive));
    unmount();
    expect(text.active).toBe(0);
    expect(root.childNodes).toHaveLength(0);
  });

  it('shows the current value after being remounted', () => {
    const text = reactive('a');
    const element = textNode(text);
    const { root, unmount } = mount(element);
    unmount();
    text.value = 'b';
    expect(root.textContent).toBe('');
    element(root);
    expect(root.textContent).toBe('b');
  });

  it('mounts before a sibling, returns its node as the head, and returns the sibling on unmount', () => {
    const root = document.createElement('div');
    const after = document.createTextNode('after');
    root.append(after);
    const element = textNode('x');
    const head = element(root, after);
    expect(root.textContent).toBe('xafter');
    expect(head).toBe(root.firstChild);
    expect(element(undefined, after)).toBe(after);
  });
});

describe('Fragment', () => {
  it('renders nothing for no children, and returns the sibling', () => {
    const fragment = Fragment({});
    expect(fragment).toBe(emptyElement);
    const sibling = document.createTextNode('s');
    expect(fragment(document.createElement('div'), sibling)).toBe(sibling);
  });

  it('is the child itself when there is exactly one', () => {
    const child = textNode('a');
    expect(Fragment({ children: child })).toBe(child);
    expect(Fragment({ children: [child] })).toBe(child);
  });

  it('renders its children in order, and returns the first one’s node as the head', () => {
    const { root } = mount(Fragment({ children: [textNode('a'), textNode('b'), textNode('c')] }));
    expect(root.textContent).toBe('abc');
  });

  it('flattens nested arrays, and skips null, undefined and false but not 0 or an empty string', () => {
    const { root } = mount(Fragment({ children: [['a', ['b']], null, undefined, false, 0, '', 'c'] }));
    expect(root.textContent).toBe('ab0c');
    // 'a', 'b', 0, '' and 'c' each get a text node.
    expect(root.childNodes).toHaveLength(5);
  });

  it('turns a primitive child into text, and takes an element child as it is', () => {
    const { root } = mount(Fragment({ children: ['x', 1, h('b', {}, 'y')] }));
    expect(html(root)).toBe('x1<b>y</b>');
  });

  // LLM.md section 9: children mount rightmost first, because each is given the node to its right as its sibling.
  it('mounts its children right to left', () => {
    const log: string[] = [];
    mount(Fragment({ children: [probe('a', log), probe('b', log), probe('c', log)] }));
    expect(log).toEqual(['mount c', 'mount b', 'mount a']);
  });

  it('mounts before the sibling it is given', () => {
    const root = document.createElement('div');
    const after = document.createTextNode('!');
    root.append(after);
    Fragment({ children: [textNode('a'), textNode('b')] })(root, after);
    expect(root.textContent).toBe('ab!');
  });

  it('removes everything it mounted on unmount', () => {
    const element = Fragment({ children: [textNode('a'), textNode('b')] });
    const { root, unmount } = mount(element);
    unmount();
    expect(root.childNodes).toHaveLength(0);
    // Unmounting restores the sibling it was given, which is what a parent needs to keep chaining.
    const sibling = document.createTextNode('s');
    expect(element(undefined, sibling)).toBe(sibling);
  });

  it('accepts a reactive child', () => {
    const text = reactive('a');
    const { root } = mount(Fragment({ children: [textNode('-'), text] }));
    text.value = 'b';
    expect(root.textContent).toBe('-b');
  });
});

describe('createMarker', () => {
  it('makes a comment node with the given text', () => {
    const marker = createMarker('here');
    expect(marker.nodeType).toBe(Node.COMMENT_NODE);
    expect(marker.data).toBe('here');
    expect(createMarker().data).toBe('');
  });
});

describe('setRef', () => {
  it('calls a function ref with the value', () => {
    const seen: unknown[] = [];
    setRef({ ref: (v: number) => seen.push(v) }, 7);
    expect(seen).toEqual([7]);
  });

  it('assigns to the value of an object ref, so a reactive works as a ref', () => {
    const r = reactive<number | undefined>(undefined);
    setRef({ ref: r }, 3);
    expect(r.value).toBe(3);
  });

  it('does nothing without a ref', () => {
    expect(() => setRef({}, 1)).not.toThrow();
  });
});

describe('createElement', () => {
  describe('construction', () => {
    it('creates its DOM node once and gives it to ref at construction, before it is mounted', () => {
      let node: Node | undefined;
      const element = createElement('div', { ref: (n) => (node = n) });
      expect(node).toBeInstanceOf(Element);
      expect(node?.parentNode).toBeNull();
      element(document.createElement('div'));
      expect(node?.parentNode).not.toBeNull();
    });

    it('sets a static prop once, at construction', () => {
      let node: Element | undefined;
      createElement('div', { id: 'a', title: 't', ref: (n) => (node = n) });
      expect(node?.getAttribute('id')).toBe('a');
      expect(node?.getAttribute('title')).toBe('t');
    });

    it('does not pass children or ref on as props', () => {
      let node: Element | undefined;
      createElement('div', { children: 'x', ref: (n) => (node = n) });
      expect(node?.hasAttribute('ref')).toBe(false);
      expect(node?.hasAttribute('children')).toBe(false);
    });

    it('accepts an object with a settable value as a ref', () => {
      const r = reactive<HTMLSpanElement | null | undefined>(undefined);
      createElement('span', { ref: r });
      expect(r.value).toBeInstanceOf(Element);
    });
  });

  describe('mounting', () => {
    it('inserts its node and renders its children inside it', () => {
      const { root } = mount(h('p', {}, 'one ', h('b', {}, 'two')));
      expect(html(root)).toBe('<p>one <b>two</b></p>');
    });

    it('returns its node as the head, and the sibling on unmount', () => {
      const root = document.createElement('div');
      const sibling = document.createTextNode('s');
      root.append(sibling);
      const element = h('i');
      const head = element(root, sibling);
      expect(head).toBe(root.firstChild);
      expect(element(undefined, sibling)).toBe(sibling);
    });

    it('is the same node across unmount and remount', () => {
      let node: Node | undefined;
      const element = createElement('div', { ref: (n) => (node = n) });
      const root = document.createElement('div');
      element(root);
      const first = root.firstChild;
      element();
      element(root);
      expect(root.firstChild).toBe(first);
      expect(root.firstChild).toBe(node);
    });

    it('removes its node on unmount', () => {
      const { root, unmount } = mount(h('div'));
      unmount();
      expect(root.childNodes).toHaveLength(0);
    });

    it('does not touch the DOM when mounted again at the same place', () => {
      const element = h('div', {}, 'x');
      const root = document.createElement('div');
      element(root);
      const seen: MutationRecord[] = [];
      const observer = new MutationObserver((records) => seen.push(...records));
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      element(root);
      element(root, null);
      expect(observer.takeRecords()).toHaveLength(0);
      observer.disconnect();
      expect(seen).toHaveLength(0);
    });

    it('moves to another parent, taking its children along', () => {
      const element = h('div', {}, 'x');
      const a = document.createElement('section');
      const b = document.createElement('section');
      element(a);
      element(b);
      expect(a.childNodes).toHaveLength(0);
      expect(html(b)).toBe('<div>x</div>');
    });
  });

  describe('reactive props', () => {
    it('does not subscribe before it is mounted, and subscribes once when it is', () => {
      const title = tracked('a');
      const element = h('div', { title: title.reactive });
      expect(title.active).toBe(0);
      mount(element);
      expect(title.active).toBe(1);
    });

    it('applies the current value on mount, then every change', () => {
      const title = reactive('a');
      const { root } = mount(h('div', { title }));
      expect(root.firstElementChild?.getAttribute('title')).toBe('a');
      title.value = 'b';
      expect(root.firstElementChild?.getAttribute('title')).toBe('b');
    });

    it('subscribes once when mounted again at the same place', () => {
      const title = tracked('a');
      const element = h('div', { title: title.reactive });
      const root = document.createElement('div');
      element(root);
      element(root);
      expect(title.total).toBe(1);
    });

    it('stops following on unmount, and picks up the current value on remount', () => {
      const title = tracked('a');
      const element = h('div', { title: title.reactive });
      const { root, unmount } = mount(element);
      const node = root.firstElementChild;
      unmount();
      expect(title.active).toBe(0);
      title.state.value = 'b';
      expect(node?.getAttribute('title')).toBe('a');
      element(root);
      expect(title.active).toBe(1);
      expect(node?.getAttribute('title')).toBe('b');
    });

    it('subscribes a child’s reactive text when mounted', () => {
      const text = tracked('a');
      const { root } = mount(h('p', {}, text.reactive));
      expect(root.textContent).toBe('a');
      expect(text.active).toBe(1);
    });

    it('unsubscribes a child’s reactive text when the element is unmounted', () => {
      const text = tracked('a');
      const { unmount } = mount(h('p', {}, text.reactive));
      unmount();
      expect(text.active).toBe(0);
    });

    it('does not resubscribe when a mounted element is moved', () => {
      const title = tracked('a');
      const element = h('div', { title: title.reactive });
      element(document.createElement('div'));
      element(document.createElement('div'));
      expect(title.total).toBe(1);
      expect(title.active).toBe(1);
    });
  });

  describe('data-* props', () => {
    function dataset(value: unknown) {
      const { root } = mount(h('div', { 'data-done': value }));
      return root.firstElementChild;
    }

    it('sets the key for a string, a number and true', () => {
      expect(dataset('x')?.getAttribute('data-done')).toBe('x');
      expect(dataset(3)?.getAttribute('data-done')).toBe('3');
      expect(dataset(true)?.getAttribute('data-done')).toBe('true');
    });

    it('leaves the key out for null, undefined and false', () => {
      for (const absent of [null, undefined, false]) {
        expect(dataset(absent)?.hasAttribute('data-done')).toBe(false);
      }
    });

    it('sets and deletes the key as a reactive boolean changes', () => {
      const done = reactive(false);
      const { root } = mount(h('div', { 'data-done': done }));
      const node = root.firstElementChild;
      expect(node?.hasAttribute('data-done')).toBe(false);
      done.value = true;
      expect(node?.hasAttribute('data-done')).toBe(true);
      done.value = false;
      expect(node?.hasAttribute('data-done')).toBe(false);
    });

    it('sets a dashed key as written', () => {
      const { root } = mount(h('div', { 'data-multi-word': 'x' }));
      expect(root.firstElementChild?.getAttribute('data-multi-word')).toBe('x');
    });
  });

  describe('a prop that is given nothing', () => {
    // Assigned as it is, the DOM would write the text 'undefined' or 'null' for most properties: nothing is no attribute, as it is for data-*.
    function made(props: Record<string, unknown>, tag = 'div') {
      return mount(h(tag, props)).root.firstElementChild;
    }

    it('leaves no attribute for null or undefined, and not the text of them', () => {
      for (const nothing of [undefined, null]) {
        const node = made({ title: nothing, id: nothing, className: nothing, lang: nothing, 'aria-label': nothing });
        expect(node?.attributes.length, `${String(nothing)}: ${node?.outerHTML}`).toBe(0);
      }
    });

    it('takes the attribute off, as nothing and not as an empty one: a link without a href is not a link', () => {
      const href = reactive<string | undefined>('/a');
      const { root } = mount(h('a', { href, tabIndex: reactive<number | undefined>(3) }));
      const link = root.firstElementChild;
      expect(link?.getAttribute('href')).toBe('/a');
      expect(link?.getAttribute('tabindex')).toBe('3');
      href.value = undefined;
      expect(link?.hasAttribute('href')).toBe(false);
    });

    it('lets a number go back to its default, and a form control to empty', () => {
      const tabIndex = reactive<number | undefined>(5);
      const value = reactive<string | undefined>('typed');
      const { root } = mount(h('div', {}, h('button', { tabIndex }), h('input', { value })));
      const [button, input] = [root.querySelector('button'), root.querySelector('input')];
      tabIndex.value = undefined;
      value.value = undefined;
      expect(button?.hasAttribute('tabindex')).toBe(false);
      expect(button?.tabIndex, 'the default, not 0 made by an empty string').toBe(0);
      expect(input?.value).toBe('');
      expect(input?.hasAttribute('value')).toBe(false);
    });

    it('clears an event handler and a style property', () => {
      const click = reactive<(() => void) | undefined>(() => {});
      const color = reactive<string | undefined>('red');
      const { root } = mount(h('div', { onclick: click, style: { color } }));
      const node = root.firstElementChild as HTMLElement;
      expect(node.onclick).not.toBeNull();
      expect(node.style.color).toBe('red');
      click.value = undefined;
      color.value = undefined;
      expect(node.onclick).toBeNull();
      expect(node.style.color).toBe('');
    });

    it('names the attribute of className and htmlFor, which are not their names in lowercase', () => {
      const { root } = mount(h('label', { className: 'a', htmlFor: 'b' }));
      const label = root.firstElementChild;
      expect([label?.getAttribute('class'), label?.getAttribute('for')]).toEqual(['a', 'b']);
      const gone = mount(h('label', { className: undefined, htmlFor: null })).root.firstElementChild;
      expect(gone?.attributes.length).toBe(0);
    });

    it('keeps false where the DOM has it as a value: draggable and spellcheck are the text "false"', () => {
      const node = made({ draggable: false, spellcheck: false });
      expect(node?.getAttribute('draggable')).toBe('false');
      // jsdom has no `spellcheck` property, so there it is only a property that was set.
      if (realBrowser) expect(node?.getAttribute('spellcheck')).toBe('false');
    });
  });

  describe('aria-* props', () => {
    // The DOM's own properties for these are camelCase (`ariaLabel`); the dashed name, as written in HTML, is set as the attribute it is.
    it('are attributes, set as written and taken off for null, undefined and false', () => {
      const { root } = mount(h('div', { 'aria-label': 'Close', 'aria-hidden': false, 'aria-busy': null, 'aria-live': 'polite' }));
      const node = root.firstElementChild;
      expect(node?.getAttribute('aria-label')).toBe('Close');
      expect(node?.getAttribute('aria-live')).toBe('polite');
      expect(node?.hasAttribute('aria-hidden')).toBe(false);
      expect(node?.hasAttribute('aria-busy')).toBe(false);
    });

    it('follow a reactive value', () => {
      const expanded = reactive<string | false>('true');
      const { root } = mount(h('button', { 'aria-expanded': expanded }));
      const node = root.firstElementChild;
      expect(node?.getAttribute('aria-expanded')).toBe('true');
      expanded.value = false;
      expect(node?.hasAttribute('aria-expanded')).toBe(false);
    });

    it('are not taken for other props that start the same way', () => {
      const { root } = mount(h('div', { ariaLabel: 'Property', datasetish: 'x' }));
      expect(root.firstElementChild?.getAttribute('aria-label')).toBe('Property');
      expect(root.firstElementChild?.hasAttribute('datasetish')).toBe(false);
    });
  });

  describe('style', () => {
    it('sets static style properties', () => {
      const { root } = mount(h('div', { style: { color: 'red', width: '10px' } }));
      const style = root.firstElementChild?.getAttribute('style') ?? '';
      expect(style).toContain('color: red');
      expect(style).toContain('width: 10px');
    });

    it('binds each property on its own, and only while mounted', () => {
      const left = tracked('1px');
      const color = reactive('red');
      const element = h('div', { style: { left: left.reactive, color } });
      const { root, unmount } = mount(element);
      const node = root.firstElementChild;
      expect(left.active).toBe(1);
      left.state.value = '2px';
      color.value = 'blue';
      const style = node?.getAttribute('style') ?? '';
      expect(style).toContain('left: 2px');
      expect(style).toContain('color: blue');
      unmount();
      expect(left.active).toBe(0);
    });
  });

  describe('events', () => {
    it('calls a lowercase handler prop when the event fires', () => {
      const seen: Event[] = [];
      const { root } = mount(h('button', { onclick: (e: Event) => seen.push(e) }));
      root.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(seen).toHaveLength(1);
      expect(seen[0]?.target).toBe(root.firstElementChild);
    });

    it('does not respond to a React-style onClick, which is just an unknown property', () => {
      let called = false;
      const { root } = mount(
        h('button', {
          onClick: () => {
            called = true;
          },
        }),
      );
      root.firstElementChild?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(called).toBe(false);
    });
  });

  describe('namespaces', () => {
    function made(tag: string, props: Record<string, unknown> = {}): Element {
      let node: Element | undefined;
      h(tag, { ...props, ref: (n: Element) => (node = n) });
      if (!node) throw new Error('ref was not called');
      return node;
    }

    it('puts an HTML tag in the HTML namespace', () => {
      const node = made('div');
      expect(node.namespaceURI).toBe(HTML_NS);
      expect(node).toBeInstanceOf(HTMLDivElement);
    });

    it('puts svg in the SVG namespace', () => {
      expect(made('svg').namespaceURI).toBe(SVG_NS);
    });

    it('puts the children of svg in the SVG namespace', () => {
      expect(made('circle').namespaceURI).toBe(SVG_NS);
      expect(made('g').namespaceURI).toBe(SVG_NS);
    });

    it('creates a tag that is neither HTML nor SVG as an SVGElement, not an HTMLUnknownElement', () => {
      const node = made('nosuchtag');
      expect(node).toBeInstanceOf(SVGElement);
      expect(node).not.toBeInstanceOf(HTMLUnknownElement);
    });

    it('puts a custom element name in the HTML namespace', () => {
      expect(made('my-widget').namespaceURI).toBe(HTML_NS);
    });

    // jsdom has no MathML classes, so this needs a real browser.

    it('sets className as the class attribute on an HTML element', () => {
      expect(made('div', { className: 'box' }).getAttribute('class')).toBe('box');
    });

    it('sets disabled, checked and value as properties on HTML form controls', () => {
      const button = made('button', { disabled: true });
      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect((button as HTMLButtonElement).disabled).toBe(true);
      const input = made('input', { value: 'v', checked: true });
      expect((input as HTMLInputElement).value).toBe('v');
      expect((input as HTMLInputElement).checked).toBe(true);
    });

    it('sets an attribute on an SVG element with setAttribute, so the name is the SVG one', () => {
      const { root } = mount(h('svg', {}, h('circle', { 'stroke-width': '3', r: '5' })));
      const circle = root.querySelector('circle');
      expect(circle?.getAttribute('stroke-width')).toBe('3');
      expect(circle?.getAttribute('r')).toBe('5');
    });
  });
});
