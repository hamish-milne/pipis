/** @jsxRuntime automatic */
/** @jsxImportSource . */

// Hydration, from markup written by hand: what a server writes, and what is wrong with it. These run with `pipis` as the hydrating platform (the
// `hydrate` project in vite.config.ts); `tools/hydrate.test.ts` is what holds a hydrated page to the page the browser makes, for the fixtures
// and the documentation's examples.
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { IS_HYDRATE, createElement, type JSXElement } from './index.ts';
import { reactive, withErrorHandler } from './reactive.ts';
import { Dynamic, Effect, ErrorBoundary, Helmet, If, List, Watch } from './dynamic.ts';
import { Static, hydrate, type HydrationReport } from './hydrate.ts';

let container: HTMLElement;

function page(markup: string, head = '') {
  document.head.innerHTML = head;
  container = document.createElement('div');
  container.innerHTML = markup;
  document.body.append(container);
}

function run(element: JSXElement) {
  const reports: HydrationReport[] = [];
  hydrate(container, element, { onMismatch: (r) => reports.push(r) });
  return reports;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('the hydrating platform', () => {
  it('is the platform', () => {
    expect(IS_HYDRATE).toBe(true);
  });

  it('adopts the nodes it finds, whatever their attributes, and reports nothing when the page is as expected', () => {
    page('<p class="old">Hello <b>there</b></p>');
    const p = container.querySelector('p');
    const b = container.querySelector('b');
    const reports = run(
      <p className="new">
        <>
          {'Hello '}
          <b>there</b>
        </>
      </p>,
    );
    expect(reports).toEqual([]);
    expect(container.querySelector('p')).toBe(p);
    expect(container.querySelector('b')).toBe(b);
    expect(p?.className).toBe('new');
  });

  it('adopts a text node by the marker before it', () => {
    page('<p><!--t-->a<!--t-->b</p>');
    const text = container.querySelector('p')?.lastChild;
    expect(run(<p>{['a', 'b']}</p>)).toEqual([]);
    expect(container.querySelector('p')?.innerHTML).toBe('ab');
    expect(container.querySelector('p')?.lastChild).toBe(text);
  });

  it('makes what the server did not write, and reports it', () => {
    page('<div></div>');
    const reports = run(
      <div>
        <h1>Title</h1>
        <p>text</p>
      </div>,
    );
    expect(container.innerHTML).toBe('<div><h1>Title</h1><p>text</p></div>');
    expect(reports).toEqual([{ missing: 4, extraneous: 0 }]);
  });

  it('removes what the page does not have, and reports it', () => {
    page('<div><i>a</i><h1>Title</h1><u>b</u><p>text</p><s>c</s></div>');
    const h1 = container.querySelector('h1');
    const reports = run(
      <div>
        <h1>Title</h1>
        <p>text</p>
      </div>,
    );
    expect(container.innerHTML).toBe('<div><h1>Title</h1><p>text</p></div>');
    expect(container.querySelector('h1')).toBe(h1);
    expect(reports[0]?.extraneous).toBeGreaterThan(0);
    expect(reports[0]?.missing).toBe(0);
  });

  it('says nothing by default but a line on the console when there is a mismatch', () => {
    page('<div></div>');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      hydrate(container, <div>x</div>);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).toContain('missing');
      warn.mockClear();
      page('<p><!--t-->x</p>');
      hydrate(container, <p>x</p>);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('regions', () => {
  it('adopts the content of a conditional, between its markers, and keeps working after', () => {
    page('<div><!----><b>yes</b><!--/--></div>');
    const b = container.querySelector('b');
    const show = reactive(true);
    expect(
      run(
        <div>
          <If condition={show}>
            <b>yes</b>
          </If>
        </div>,
      ),
    ).toEqual([]);
    expect(container.querySelector('b')).toBe(b);
    show.value = false;
    expect(container.querySelector('b')).toBeNull();
    show.value = true;
    expect(container.querySelector('b')?.textContent).toBe('yes');
  });

  it('adopts the rows of a list in order, and updates them afterwards', () => {
    page('<ul><!----><li><!--t-->a</li><li><!--t-->b</li><!--/--></ul>');
    const [a, b] = [...container.querySelectorAll('li')];
    const items = reactive(['a', 'b']);
    expect(
      run(
        <ul>
          <List items={items} itemKey={(x) => x}>
            {(x) => <li>{x}</li>}
          </List>
        </ul>,
      ),
    ).toEqual([]);
    expect([...container.querySelectorAll('li')]).toEqual([a, b]);
    items.value = ['b', 'c', 'a'];
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['b', 'c', 'a']);
    expect(container.querySelectorAll('li')[0]).toBe(b);
  });

  it('makes a region that the server wrote no markers for', () => {
    page('<div></div>');
    const reports = run(
      <div>
        <If condition={reactive(true)}>
          <b>yes</b>
        </If>
      </div>,
    );
    expect(container.querySelector('b')?.textContent).toBe('yes');
    expect(reports[0]?.missing).toBeGreaterThan(0);
  });

  it('removes what a region has that its content does not', () => {
    page('<div><!----><b>yes</b><i>stray</i><!--/--></div>');
    run(
      <div>
        <If condition={reactive(true)}>
          <b>yes</b>
        </If>
      </div>,
    );
    expect(container.querySelector('i')).toBeNull();
  });

  it('finds the start of a region that has regions inside it', () => {
    page('<div><!----><!----><b>a</b><!--/--><i>b</i><!--/--></div>');
    const [b, i] = [container.querySelector('b'), container.querySelector('i')];
    const on = reactive(true);
    expect(
      run(
        <div>
          <If condition={on}>
            <>
              <If condition={on}>
                <b>a</b>
              </If>
              <i>b</i>
            </>
          </If>
        </div>,
      ),
    ).toEqual([]);
    expect([container.querySelector('b'), container.querySelector('i')]).toEqual([b, i]);
  });
});

describe('state', () => {
  it('allows a write as the page is mounted, and what follows it shows the value', () => {
    page('<div><p><!--t-->1</p><!----><i></i><!--/--></div>');
    const n = reactive(0);
    const Setter = () => (
      <Dynamic value={reactive(1)}>
        {() => {
          n.value = 1;
          return <i />;
        }}
      </Dynamic>
    );
    // The paragraph is to the left of the write, so it is mounted after it; one to the right is mounted first, and follows the write.
    const reports = run(
      <div>
        <p>{n}</p>
        <Setter />
      </div>,
    );
    expect(container.querySelector('p')?.textContent).toBe('1');
    expect(reports).toEqual([]);
  });

  it('refuses a write that makes a region that is already mounted change what it shows, and says why', () => {
    page('<div><i></i><!----><b>yes</b><!--/--></div>');
    const b = container.querySelector('b');
    const show = reactive(true);
    const errors: unknown[] = [];
    // The conditional is to the right of the write, so it is mounted first and is following the state when it is written.
    const Setter = () => (
      <Dynamic value={reactive(1)}>
        {() => {
          show.value = false;
          return <i />;
        }}
      </Dynamic>
    );
    withErrorHandler(
      (error) => errors.push(error),
      () =>
        run(
          <div>
            <Setter />
            <If condition={show}>
              <b>yes</b>
            </If>
          </div>,
        ),
    );
    expect(String(errors[0])).toContain('while the page was being hydrated');
    expect(container.querySelector('b')).toBe(b);
  });

  it('allows writes once the page is whole, and runs effects then', () => {
    page('<p><!--t-->0</p>');
    const n = reactive(0);
    const seen: string[] = [];
    run(
      <>
        <Effect>
          {() => {
            seen.push(container.textContent ?? '');
            n.value = 1;
            return undefined;
          }}
        </Effect>
        <p>{n}</p>
      </>,
    );
    expect(seen).toEqual(['0']);
    expect(container.textContent).toBe('1');
  });

  it('gives refs when the page is whole', () => {
    page('<p><b></b></p>');
    const seen: unknown[] = [];
    const ref = reactive<Element | undefined>(undefined);
    run(
      <p>
        <b ref={(el: Element) => seen.push(el.parentNode?.nodeName)} />
      </p>,
    );
    expect(seen).toEqual(['P']);
    expect(ref.value).toBeUndefined();
  });

  it('is synchronous and leaves the page live: Watch runs for each change after', () => {
    page('<p><!--t-->a</p>');
    const n = reactive('a');
    const seen: string[] = [];
    run(
      <>
        <Watch value={n}>{(v) => void seen.push(v)}</Watch>
        <p>{n}</p>
      </>,
    );
    n.value = 'b';
    expect(seen).toEqual(['a', 'b']);
    expect(container.textContent).toBe('b');
  });
});

describe('the error boundary', () => {
  it('shows its fallback for a child that throws as it is hydrated', () => {
    page('<div><!----><p>x</p><!--/--></div>');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const Boom = () => (
        <Dynamic value={reactive(1)}>
          {(): JSXElement => {
            throw new Error('boom');
          }}
        </Dynamic>
      );
      run(
        <div>
          <ErrorBoundary fallback={() => <b>fallback</b>}>
            <Boom />
          </ErrorBoundary>
        </div>,
      );
      expect(container.querySelector('b')?.textContent).toBe('fallback');
      expect(container.querySelector('p')).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('the head', () => {
  it('replaces what the server wrote for Helmet, and leaves the rest of the head', () => {
    page('<main><!----><!--/--></main>', '<meta charset="utf-8"><!--h--><title>Server</title><!--/h-->');
    const meta = document.head.querySelector('meta');
    run(
      <main>
        <Helmet>
          <title>Client</title>
        </Helmet>
      </main>,
    );
    expect(document.head.querySelector('meta')).toBe(meta);
    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.title).toBe('Client');
    expect(document.head.innerHTML).not.toContain('<!--h-->');
  });
});

describe('form controls', () => {
  it('leaves what a person has typed, and gives the value to a control that has not been changed', () => {
    page('<div><input value="server"><input value="server"></div>');
    const [typed, untouched] = [...container.querySelectorAll('input')];
    if (!typed || !untouched) throw new Error('inputs');
    typed.value = 'typed';
    run(
      <div>
        <input value="app" />
        <input value="app" />
      </div>,
    );
    expect(typed.value).toBe('typed');
    expect(untouched.value).toBe('app');
  });
});

describe('Static', () => {
  it('adopts the markup of the server without running its children', () => {
    page('<div><!----><p>one</p><p>two</p><!--/--><span>after</span></div>');
    const [p, span] = [container.querySelector('p'), container.querySelector('span')];
    const made = vi.fn(() => <p>never</p>);
    expect(
      run(
        <div>
          <Static>{made}</Static>
          <span>after</span>
        </div>,
      ),
    ).toEqual([]);
    expect(made).not.toHaveBeenCalled();
    expect(container.querySelector('p')).toBe(p);
    expect(container.querySelector('span')).toBe(span);
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});

describe('when it cannot', () => {
  it('builds the page again, from nothing, when the app throws, and reports the error', () => {
    page('<p>stale</p>');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let attempts = 0;
      const Flaky: JSXElement = (parent, sibling) => {
        if (attempts++ === 0) throw new Error('first time');
        return (<p>fresh</p>)(parent, sibling);
      };
      const reports = run(Flaky);
      expect(container.innerHTML).toBe('<p>fresh</p>');
      expect(String(reports[0]?.error)).toContain('first time');
    } finally {
      warn.mockRestore();
    }
  });

  it('does not take a page that is hydrated twice', () => {
    page('<p></p>');
    expect(() => hydrate(container, createElement('p', { children: createElement('b', {}) }))).not.toThrow();
  });
});
