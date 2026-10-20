/** @jsxRuntime automatic */
/** @jsxImportSource . */

// The browser's side of islands: the markers that a server wrote, found and mounted over. (What the server writes is islands.server.test.tsx,
// and that the two fit together is tools/server.test.ts, which renders a page on the server and mounts its islands in jsdom.)
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { reactive, select, type JSXElement } from './index.ts';
import { Island, Slot, mountIslands } from './islands.ts';
import { mount } from '../test/dom.ts';

function Counter(props: { start: number }): JSXElement {
  const count = reactive(props.start);
  return <button onclick={() => count.value++}>{select(count, (n) => `Clicked ${n}`)}</button>;
}

/** What the server writes for `<Island name="counter" component={Counter} props={{ start: 5 }} />`, in a page. */
const PAGE =
  '<main><h1>Title</h1><div data-island="counter" data-props="{&quot;start&quot;:5}" style="display: contents;"><button>Clicked 5</button></div><p>Static</p></main>';

let page: HTMLElement | undefined;
function made(html = PAGE) {
  page = document.createElement('div');
  page.innerHTML = html;
  document.body.append(page);
  return page;
}

afterEach(() => {
  page?.remove();
  page = undefined;
});

describe('mountIslands', () => {
  it('mounts the component over the markup, with the props that were written, and leaves the rest of the page', () => {
    const root = made();
    const title = root.querySelector('h1');
    mountIslands({ counter: Counter }, root);
    const button = root.querySelector('button');
    expect(button?.textContent).toBe('Clicked 5');
    button?.click();
    expect(button?.textContent).toBe('Clicked 6');
    expect(root.querySelector('h1'), 'the page around an island is the server’s').toBe(title);
    expect(root.querySelectorAll('button').length, 'the markup of the server is replaced, not added to').toBe(1);
  });

  it('mounts every island of the page, and each has its own props', () => {
    const root = made(
      '<div data-island="counter" data-props="{&quot;start&quot;:1}"></div><div data-island="counter" data-props="{&quot;start&quot;:10}"></div>',
    );
    mountIslands({ counter: Counter }, root);
    expect([...root.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Clicked 1', 'Clicked 10']);
  });

  it('mounts a component with no props, for an island that was written without any', () => {
    const root = made('<div data-island="hello"></div>');
    mountIslands({ hello: () => <p>Hello</p> }, root);
    expect(root.textContent).toBe('Hello');
  });

  it('does not mount an island twice, when it is asked again', () => {
    const root = made();
    mountIslands({ counter: Counter }, root);
    root.querySelector('button')?.click();
    mountIslands({ counter: Counter }, root);
    expect(root.querySelector('button')?.textContent, 'it was not made again').toBe('Clicked 6');
  });

  it('unmounts them all with what it returns, and leaves nothing subscribed', () => {
    const root = made();
    const unmount = mountIslands({ counter: Counter }, root);
    expect(root.querySelector('button')).not.toBeNull();
    unmount();
    expect(root.querySelector('button')).toBeNull();
  });

  it('makes only the outer island of two, since the component of the outer one made its own', () => {
    const made = vi.fn();
    const root = (page = document.createElement('div'));
    root.innerHTML = '<div data-island="outer"><div data-island="inner"></div></div>';
    document.body.append(root);
    const Inner = () => {
      made('inner from the server');
      return <i>inner</i>;
    };
    const Outer = () => <section>{Island({ name: 'inner', component: () => <b>inner of the outer</b> })}</section>;
    mountIslands({ outer: Outer, inner: Inner }, root);
    expect(made).not.toHaveBeenCalled();
    expect(root.innerHTML).toBe('<div data-island="outer"><section><b>inner of the outer</b></section></div>');
  });

  it('reports an island that has no component, and one that throws, and mounts the others', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const root = made(
        '<div data-island="missing"></div><div data-island="broken"></div><div data-island="counter" data-props="{&quot;start&quot;:7}"></div>',
      );
      mountIslands(
        {
          counter: Counter,
          broken: () => {
            throw new Error('this one is broken');
          },
        },
        root,
      );
      expect(root.querySelector('button')?.textContent).toBe('Clicked 7');
      expect(errors).toHaveBeenCalledTimes(2);
      const messages = errors.mock.calls.map(([e]) => (e as Error).message);
      expect(messages[0]).toContain("No island 'missing'");
      expect(messages[0]).toContain('counter, broken');
      expect(messages[1]).toBe('this one is broken');
    } finally {
      errors.mockRestore();
    }
  });

  it('looks in the document when it is not given a root', () => {
    made('<div data-island="hello"></div>');
    mountIslands({ hello: () => <p id="hello-island">Hello</p> });
    expect(document.getElementById('hello-island')).not.toBeNull();
  });
});

describe('Island in the browser', () => {
  it('is only the component: there is no page to mark it in', () => {
    const { root } = mount(<Island name="counter" component={Counter} props={{ start: 2 }} />);
    expect(root.innerHTML).toBe('<button>Clicked 2</button>');
  });
});

describe('Slot', () => {
  /** What the server writes for `Block` below, with its content in a slot. */
  const BLOCK = (slot = '<pre>code</pre>') =>
    `<div data-island="block" data-props="{&quot;title&quot;:&quot;T&quot;}" style="display: contents;"><figure><figcaption>T</figcaption><div data-slot="content" style="display: contents;">${slot}</div></figure></div>`;

  function Block(props: { title: string; content?: () => JSXElement }): JSXElement {
    const open = reactive(false);
    return (
      <figure className={select(open, (o) => (o ? 'open' : 'shut'))}>
        <button onclick={() => (open.value = !open.value)}>{props.title}</button>
        <Slot>{props.content}</Slot>
      </figure>
    );
  }

  it('moves what the server wrote into the island that replaces the markup, so it is the same node and is not made again', () => {
    const root = made(`<main>${BLOCK()}</main>`);
    const code = root.querySelector('pre');
    mountIslands({ block: Block }, root);
    expect(root.querySelector('pre'), 'the code is the server’s').toBe(code);
    expect(root.querySelectorAll('pre').length).toBe(1);
    // It is inside the island's own markup now, after the button, and the island works.
    expect(root.querySelector('figure')?.firstElementChild?.tagName).toBe('BUTTON');
    expect(code?.closest('figure')).toBe(root.querySelector('figure'));
    root.querySelector('button')?.click();
    expect(root.querySelector('figure')?.className).toBe('open');
  });

  it('keeps the slots of an island apart by their names', () => {
    const Two = () => (
      <section>
        <Slot name="b" />
        <Slot name="a" />
      </section>
    );
    const root = made(
      '<div data-island="two"><div data-slot="a" style="display: contents;"><i>A</i></div><div data-slot="b" style="display: contents;"><b>B</b></div></div>',
    );
    mountIslands({ two: Two }, root);
    expect(root.querySelector('section')?.textContent).toBe('BA');
  });

  it('renders its own content when the browser makes the island with no markup from the server, if it is given any', () => {
    const root = made('<div data-island="block" data-props="{&quot;title&quot;:&quot;T&quot;}"></div>');
    mountIslands({ block: (p: { title: string }) => Block({ ...p, content: () => <pre>made here</pre> }) }, root);
    expect(root.querySelector('pre')?.textContent).toBe('made here');
  });

  it('is empty when there is nothing from the server and nothing to make', () => {
    const root = made('<div data-island="block" data-props="{&quot;title&quot;:&quot;T&quot;}"></div>');
    mountIslands({ block: Block }, root);
    expect(root.querySelector('pre')).toBeNull();
    expect(root.querySelector('button')?.textContent).toBe('T');
  });

  it('is only its content in the browser, where there is no page to mark it in', () => {
    const { root } = mount(<Slot>{() => <pre>x</pre>}</Slot>);
    expect(root.innerHTML).toBe('<pre>x</pre>');
  });
});
