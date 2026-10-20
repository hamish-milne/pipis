/** @jsxRuntime automatic */
/** @jsxImportSource . */

// Islands in a build that hydrates: an island is a page of its own to hydrate, so what the server wrote for it is adopted and not replaced, and
// the island's marker in a page that is hydrated is the page's own. (packages/pipis/tools/hydrate.test.ts renders such pages on the server.)
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { reactive, select, type JSXElement } from './index.ts';
import { Island, Slot, mountIslands } from './islands.ts';
import { Static, hydrate } from './hydrate.ts';

function Counter(props: { start: number }): JSXElement {
  const count = reactive(props.start);
  return <button onclick={() => count.value++}>{select(count, (n) => `Clicked ${n}`)}</button>;
}

const MARKER = '<div data-island="counter" data-props="{&quot;start&quot;:5}" style="display: contents;">';
const ISLAND = `${MARKER}<button><!--t-->Clicked 5</button></div>`;

let container: HTMLElement;
function page(markup: string, head = '') {
  document.head.innerHTML = head;
  container = document.createElement('div');
  container.innerHTML = markup;
  document.body.append(container);
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('mountIslands, in a build that hydrates', () => {
  it('adopts the markup of an island, and the island works', () => {
    page(`<main><h1>Title</h1>${ISLAND}<p>Static</p></main>`);
    const button = container.querySelector('button');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mountIslands({ counter: Counter }, container);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(container.querySelector('button')).toBe(button);
    button?.click();
    expect(button?.textContent).toBe('Clicked 6');
  });

  it('repairs an island that is not what the component makes, and says so', () => {
    page(`<main>${MARKER}<button><!--t-->Clicked 9</button><i>stray</i></div></main>`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mountIslands({ counter: Counter }, container);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
    expect(container.querySelector('i')).toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Clicked 5');
  });

  it('leaves the head that the page wrote: an island does not own it', () => {
    page(ISLAND, '<meta charset="utf-8"><!--h--><title>Server</title><!--/h-->');
    mountIslands({ counter: Counter }, container);
    expect(document.head.querySelector('title')?.textContent).toBe('Server');
  });
});

describe('an island in a page that is hydrated', () => {
  it("is the page's own: its marker is adopted, and mountIslands does not mount it again", () => {
    page(`<main>${ISLAND}</main>`);
    const [marker, button] = [container.querySelector('[data-island]'), container.querySelector('button')];
    const reports: unknown[] = [];
    hydrate(
      container,
      <main>
        <Island name="counter" component={Counter} props={{ start: 5 }} />
      </main>,
      { onMismatch: (r) => reports.push(r) },
    );
    expect(reports).toEqual([]);
    expect(container.querySelector('[data-island]')).toBe(marker);
    expect(container.querySelector('button')).toBe(button);
    mountIslands({ counter: Counter }, container);
    button?.click();
    expect(button?.textContent, 'one handler, from one mount').toBe('Clicked 6');
  });

  it('is mounted over what a Static region adopted, which is how a page puts a component into its text', () => {
    page(`<main><!---->${ISLAND}<p>after</p><!--/--></main>`);
    const [button, p] = [container.querySelector('button'), container.querySelector('p')];
    const made = vi.fn(() => <p>never</p>);
    hydrate(
      container,
      <main>
        <Static>{made}</Static>
      </main>,
    );
    expect(made).not.toHaveBeenCalled();
    mountIslands({ counter: Counter }, container);
    expect(container.querySelector('button')).toBe(button);
    expect(container.querySelector('p')).toBe(p);
    button?.click();
    expect(button?.textContent).toBe('Clicked 6');
  });
});

describe('Slot, in a build that hydrates', () => {
  const Block = (props: { content?: () => JSXElement }): JSXElement => (
    <figure>
      <Slot>{props.content}</Slot>
    </figure>
  );
  const MARKUP = `<div data-island="block" style="display: contents;"><figure><div data-slot="content" style="display: contents;"><!----><pre>code</pre><!--/--></div></figure></div>`;

  it('is adopted in place with what the server wrote, and its content is not made', () => {
    page(MARKUP);
    const code = container.querySelector('pre');
    const made = vi.fn(() => <pre>never</pre>);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mountIslands({ block: () => Block({ content: undefined }) }, container);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(made).not.toHaveBeenCalled();
    expect(container.querySelector('pre')).toBe(code);
    expect(container.querySelectorAll('pre').length).toBe(1);
  });
});
