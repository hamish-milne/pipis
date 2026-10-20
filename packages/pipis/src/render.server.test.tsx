/** @jsxRuntime automatic */
/** @jsxImportSource . */

// What a server renders. These run with `pipis` as the server's platform (the `server` project in vite.config.ts), without a DOM:
// `packages/pipis/tools/server.test.ts` is what holds the markup to the browser build's.
import { describe, expect, it } from 'vite-plus/test';
import { IS_CLIENT, REACTIVE, createElement, type JSXElement, type Reactive } from './index.ts';
import { reactive, select } from './reactive.ts';
import { Dynamic, Effect, ErrorBoundary, Helmet, If, List, OneOf, Portal, PortalTarget, ReactiveList, Suspense, Watch } from './dynamic.ts';
import { renderToString, serializeData } from './server.ts';

const html = (element: JSXElement) => renderToString(element).html;

describe('the server platform', () => {
  it('is the server: there is no browser to run code for', () => {
    expect(IS_CLIENT).toBe(false);
    expect(typeof document).toBe('undefined');
  });
});

describe('elements', () => {
  it('renders nested elements and text', () => {
    expect(
      html(
        <p>
          Hello, <b>world</b>!
        </p>,
      ),
    ).toBe('<p>Hello, <b>world</b>!</p>');
    expect(html(<>one two</>)).toBe('one two');
    expect(
      html(
        <p>
          {null}
          {undefined}
          {0}
        </p>,
      ),
    ).toBe('<p>0</p>');
  });

  it('writes void elements without an end tag, and every other element with one', () => {
    expect(
      html(
        <div>
          <br />
          <img src="a.png" alt="" />
          <input />
          <span />
        </div>,
      ),
    ).toBe('<div><br><img src="a.png" alt=""><input><span></span></div>');
  });

  it('escapes text, and attribute values', () => {
    expect(html(<p>{'1 < 2 && 3 > 2\u00a0!'}</p>)).toBe('<p>1 &lt; 2 &amp;&amp; 3 &gt; 2&nbsp;!</p>');
    expect(html(<a href={'/x?a=1&b="2"'} title={'<"&>'} />)).toBe('<a href="/x?a=1&amp;b=&quot;2&quot;" title="&lt;&quot;&amp;&gt;"></a>');
  });

  it('writes the text of script and style as it is, and not as markup it could be mistaken for', () => {
    expect(html(<style>{'a > b { content: "&" }'}</style>)).toBe('<style>a > b { content: "&" }</style>');
    expect(html(<script>{'if (a < b && c) {}'}</script>)).toBe('<script>if (a < b && c) {}</script>');
  });

  it('keeps a newline that starts a pre or a textarea, which a parser would otherwise drop', () => {
    expect(html(<pre>{'\nx'}</pre>)).toBe('<pre>\n\nx</pre>');
    expect(html(<pre>{'x\n'}</pre>)).toBe('<pre>x\n</pre>');
  });

  it('makes a tag that HTML does not know SVG, as the browser build does, and keeps the case of its names', () => {
    expect(
      html(
        <svg viewBox="0 0 1 1">
          <path d="M0 0" />
          <linearGradient id="g" />
        </svg>,
      ),
    ).toBe('<svg viewBox="0 0 1 1"><path d="M0 0"></path><linearGradient id="g"></linearGradient></svg>');
  });

  it('makes a custom element HTML', () => {
    expect(html(createElement('my-widget' as 'div', {}))).toBe('<my-widget></my-widget>');
  });
});

describe('props', () => {
  it('writes the props that are attributes, by the name the attribute has', () => {
    expect(html(<label className="a b" htmlFor="x" id="l" tabIndex={-1} title="t" />)).toBe(
      '<label class="a b" for="x" id="l" tabindex="-1" title="t"></label>',
    );
  });

  it('writes a boolean prop as an attribute that is there or is not', () => {
    expect(html(<button disabled hidden={false} />)).toBe('<button disabled=""></button>');
    expect(html(<input type="checkbox" checked disabled={false} />)).toBe('<input type="checkbox" checked="">');
  });

  it('writes the state of a form control as what the page starts from', () => {
    expect(html(<input value={'a"b'} />)).toBe('<input value="a&quot;b">');
    expect(html(<textarea value={'text'} />)).toBe('<textarea>text</textarea>');
    expect(html(<option value="1" selected />)).toBe('<option value="1" selected=""></option>');
    expect(html(<progress value={3} max={10} />)).toBe('<progress value="3" max="10"></progress>');
  });

  it('writes data-* props, and takes the attribute off for an empty one', () => {
    expect(html(<i data-id={1} data-gone={null} data-no={false} data-multi-word="x" />)).toBe('<i data-id="1" data-multi-word="x"></i>');
  });

  it('writes aria-* props as attributes, like data-*', () => {
    expect(html(<button aria-label="Close" aria-hidden={false} aria-expanded="true" ariaLive="polite" />)).toBe(
      '<button aria-label="Close" aria-expanded="true" aria-live="polite"></button>',
    );
  });

  it('leaves an attribute out when its prop is empty (null, undefined or false), and writes an empty string', () => {
    expect(html(<a href={undefined} title={null as never} id="" />)).toBe('<a id=""></a>');
    // `false` is a value where the DOM's own property takes it: these two are the text "false", and absent is the default.
    expect(html(<div draggable={false} spellcheck={false} />)).toBe('<div draggable="false" spellcheck="false"></div>');
    expect(html(<input value={undefined} />)).toBe('<input>');
    expect(html(<ol start={undefined} />)).toBe('<ol></ol>');
    expect(html(<textarea value={null as never} />)).toBe('<textarea></textarea>');
  });

  it('writes style as the declarations a browser would, in the order they were given', () => {
    expect(html(<p style={{ color: 'red', backgroundColor: 'blue', cssFloat: 'left', webkitTransform: 'none' }} />)).toBe(
      '<p style="color: red; background-color: blue; float: left; -webkit-transform: none;"></p>',
    );
    expect(html(<p style={{ color: undefined }} />)).toBe('<p></p>');
  });

  it('puts the style where it was first set among the attributes', () => {
    expect(html(<p id="a" style={{ color: 'red' }} title="t" />)).toBe('<p id="a" style="color: red;" title="t"></p>');
  });

  it('does not write an event handler, which is for a browser', () => {
    expect(html(<button onclick={() => {}} onmouseover={() => {}} />)).toBe('<button></button>');
  });

  it('does not write a prop that is not an attribute', () => {
    expect(html(<div scrollTop={5} />)).toBe('<div></div>');
  });

  it('takes textContent and innerHTML as the content they set', () => {
    expect(html(<p textContent="a < b" />)).toBe('<p>a &lt; b</p>');
    expect(html(<p innerHTML="<b>bold</b>" />)).toBe('<p><b>bold</b></p>');
  });

  it('does not give a ref to anything: the node is not one a page has', () => {
    let given = 0;
    html(<p ref={() => given++} />);
    expect(given).toBe(0);
  });
});

describe('reactive values', () => {
  it('shows each as it is when the element is mounted', () => {
    const name = reactive('world');
    const cls = reactive('big');
    const doubled = select(reactive(21), (n) => n * 2);
    expect(
      html(
        <p className={cls} style={{ color: select(cls, (c) => (c === 'big' ? 'red' : 'blue')) }}>
          Hello {name}, {doubled}
        </p>,
      ),
    ).toBe('<p class="big" style="color: red;">Hello world, 42</p>');
  });

  it('lets go of every subscription when it is done, so a later change reaches nothing', () => {
    let live = 0;
    const source: Reactive<string> = {
      [REACTIVE]: true,
      subscribe(callback) {
        live++;
        callback('x');
        return () => live--;
      },
    };
    expect(html(<p title={source}>{source}</p>)).toBe('<p title="x">x</p>');
    expect(live).toBe(0);
  });
});

describe('structure', () => {
  it('shows the branch that is current, and leaves a comment where the region is', () => {
    const on = reactive(true);
    expect(
      html(
        <div>
          <If condition={on}>
            <b>yes</b>
          </If>
        </div>,
      ),
    ).toBe('<div><!----><b>yes</b></div>');
    expect(
      html(
        <div>
          <If condition={reactive(false)}>
            <b>yes</b>
          </If>
        </div>,
      ),
    ).toBe('<div><!----></div>');
  });

  it('shows the child that is chosen', () => {
    expect(
      html(
        <OneOf selector={reactive(1)}>
          <i>a</i>
          <b>b</b>
        </OneOf>,
      ),
    ).toBe('<!----><b>b</b>');
  });

  it('shows every row of a list, in order', () => {
    const items = reactive([3, 1, 2]);
    expect(
      html(
        <ul>
          <List items={items} itemKey={(n) => n}>
            {(n) => <li>{n}</li>}
          </List>
        </ul>,
      ),
    ).toBe('<ul><!----><li>3</li><li>1</li><li>2</li></ul>');
    expect(
      html(
        <ul>
          <ReactiveList items={items} itemKey={(n) => n}>
            {(n) => <li>{n}</li>}
          </ReactiveList>
        </ul>,
      ),
    ).toBe('<ul><!----><li>3</li><li>1</li><li>2</li></ul>');
  });

  it('shows what a Dynamic is given', () => {
    expect(html(<Dynamic value={reactive('x')}>{(v) => <em>{v}</em>}</Dynamic>)).toBe('<!----><em>x</em>');
  });

  it('shows the fallback of an error boundary when a child throws as it mounts', () => {
    const Broken = (): JSXElement => {
      throw new Error('no');
    };
    const Bad = (): JSXElement => (parent) => {
      if (parent) throw new Error('boom');
      return null;
    };
    expect(
      html(
        <ErrorBoundary fallback={(e) => <p>failed: {select(e, (x) => (x instanceof Error ? x.message : ''))}</p>}>
          <Bad />
        </ErrorBoundary>,
      ),
    ).toContain('failed: boom');
    expect(() => html(<Broken />)).toThrow('no');
  });
});

describe('what is for a browser', () => {
  it('does not run an effect, or a watch', () => {
    const ran: string[] = [];
    const n = reactive(1);
    expect(
      html(
        <p>
          text<Effect>{() => void ran.push('effect')}</Effect>
          <Watch value={n}>{(v) => ran.push(`watch ${v}`)}</Watch>
        </p>,
      ),
    ).toBe('<p>text</p>');
    expect(ran).toEqual([]);
  });

  it('shows what a Suspense shows while it waits, and does not start the promise', () => {
    let started = 0;
    const view = (
      <Suspense promise={() => (started++, Promise.resolve('data'))} emptyData="" loading={<i>loading</i>} error={() => <b>error</b>}>
        {(data) => <p>{data}</p>}
      </Suspense>
    );
    expect(html(view)).toBe('<!----><i>loading</i>');
    expect(started).toBe(0);
  });

  it('does not render into a portal: nothing runs it', () => {
    const target = reactive<readonly [Node, Node | null] | undefined>(undefined);
    expect(
      html(
        <div>
          <PortalTarget ref={target} />
          <Portal target={target}>
            <b>moved</b>
          </Portal>
        </div>,
      ),
    ).toBe('<div><!----></div>');
  });
});

describe('the document head', () => {
  it('collects what Helmet renders, apart from the markup', () => {
    const result = renderToString(
      <main>
        <Helmet>
          <title>Page</title>
          <meta name="description" content="d" />
        </Helmet>
        <h1>Hi</h1>
      </main>,
    );
    expect(result.html).toBe('<main><h1>Hi</h1></main>');
    expect(result.head).toBe('<title>Page</title><meta name="description" content="d">');
  });

  it('puts what each Helmet renders at the start of the head, as the browser build does: siblings are mounted last to first', () => {
    expect(
      renderToString(
        <>
          <Helmet>
            <title>A</title>
          </Helmet>
          <Helmet>
            <title>B</title>
          </Helmet>
        </>,
      ).head,
    ).toBe('<title>A</title><title>B</title>');
  });
});

describe('hydratable markup', () => {
  const hydratable = (element: JSXElement) => renderToString(element, { hydratable: true });

  it('says where each text node begins, so that the ones that merge when parsed can be told apart', () => {
    expect(hydratable(<p>Hello {reactive('world')}!</p>).html).toBe('<p><!--t-->Hello <!--t-->world<!--t-->!</p>');
  });

  it('marks a text node that is empty, which is not in the markup but is a text node', () => {
    expect(hydratable(<p>a{reactive('')}b</p>).html).toBe('<p><!--t-->a<!--t--><!--t-->b</p>');
  });

  it('writes none of it unless asked, and nothing but the start of a region when it is', () => {
    const page = (
      <div>
        text
        <If condition={reactive(true)}>
          <b>x</b>
        </If>
      </div>
    );
    expect(renderToString(page).html).toBe('<div>text<!----><b>x</b></div>');
  });

  it('writes where a region ends, as well as where it begins', () => {
    expect(
      hydratable(
        <div>
          <If condition={reactive(true)}>
            <b>x</b>
          </If>
          <i>after</i>
        </div>,
      ).html,
    ).toBe('<div><!----><b><!--t-->x</b><!--/--><i><!--t-->after</i></div>');
  });

  it('nests the regions, each with its own end', () => {
    const inner = reactive(true);
    expect(
      hydratable(
        <If condition={reactive(true)}>
          <If condition={inner}>
            <b />
          </If>
        </If>,
      ).html,
    ).toBe('<!----><!----><b></b><!--/--><!--/-->');
  });

  it('puts no marker inside the text of title, textarea, script and style, where it would be text', () => {
    expect(hydratable(<textarea value="a" />).html).toBe('<textarea>a</textarea>');
    expect(hydratable(<style>{'a{}'}</style>).html).toBe('<style>a{}</style>');
    const { head } = hydratable(
      <Helmet>
        <title>T</title>
      </Helmet>,
    );
    expect(head).toBe('<!--h--><title>T</title><!--/h-->');
  });

  it('marks the head that components wrote only when there is one', () => {
    expect(hydratable(<p>no head</p>).head).toBe('');
    expect(
      renderToString(
        <Helmet>
          <title>T</title>
        </Helmet>,
      ).head,
    ).toBe('<title>T</title>');
  });

  it('keeps a newline that starts a pre, which the marker before the text now stands in front of', () => {
    expect(hydratable(<pre>{'\nx'}</pre>).html).toBe('<pre><!--t-->\nx</pre>');
  });
});

describe('a render', () => {
  it('is a render of its own, whatever came before', () => {
    expect(
      renderToString(
        <Helmet>
          <title>A</title>
        </Helmet>,
      ).head,
    ).toBe('<title>A</title>');
    expect(renderToString(<p>b</p>).head).toBe('');
  });

  it('can be made again after one that threw', () => {
    const Bad = (): JSXElement => (parent) => {
      if (parent) throw new Error('boom');
      return null;
    };
    expect(() => renderToString(<Bad />)).toThrow('boom');
    expect(html(<p>ok</p>)).toBe('<p>ok</p>');
  });

  it('cannot be made inside another: a render is synchronous, and there is one at a time', () => {
    const Inner = (): JSXElement => (parent) => {
      if (parent) html(<p />);
      return null;
    };
    expect(() => html(<Inner />)).toThrow('another render');
  });

  it('refuses Helmet outside a render, where there is no head', () => {
    const head = (
      <Helmet>
        <title>x</title>
      </Helmet>
    );
    expect(() => head({} as Node)).toThrow('outside renderToString');
  });
});

describe('serializeData', () => {
  it('writes JSON that cannot end its script, or begin another tag', () => {
    const text = serializeData({ a: '</script><!-- & \u2028 \u2029' });
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual({ a: '</script><!-- & \u2028 \u2029' });
  });

  it('writes null for what JSON cannot hold', () => {
    expect(serializeData(undefined)).toBe('null');
    expect(serializeData(() => 1)).toBe('null');
    expect(serializeData([1, 'a', null, true])).toBe('[1,"a",null,true]');
  });
});
