/** @jsxRuntime automatic */
/** @jsxImportSource . */

// What a server writes for an island. These run with `pipis` as the server's build (the `server` project in vite.config.ts).
import { describe, expect, it } from 'vite-plus/test';
import { reactive, select, type JSXElement } from './index.ts';
import { Island, Slot } from './islands.ts';
import { renderToString } from './server.ts';

const html = (element: JSXElement) => renderToString(element).html;

function Counter(props: { start: number }): JSXElement {
  const count = reactive(props.start);
  return <button onclick={() => count.value++}>{select(count, (n) => `Clicked ${n}`)}</button>;
}

const Hello = (): JSXElement => <p>Hello</p>;

describe('Island on a server', () => {
  it('writes the component inside a marker that names it and carries its props', () => {
    expect(html(<Island name="counter" component={Counter} props={{ start: 3 }} />)).toBe(
      '<div data-island="counter" data-props="{&quot;start&quot;:3}" style="display: contents;"><button>Clicked 3</button></div>',
    );
  });

  it('writes no props for a component that takes none', () => {
    expect(html(<Island name="hello" component={Hello} />)).toBe('<div data-island="hello" style="display: contents;"><p>Hello</p></div>');
  });

  it('writes props that cannot end the attribute or begin a tag, and the browser reads back what was given', () => {
    const props = { text: '"><script>alert(1)</script> & \u2028' };
    const out = html(<Island name="x" component={(p: typeof props) => <p>{p.text}</p>} props={props} />);
    expect(out).not.toContain('<script>');
    const attribute = /data-props="([^"]*)"/.exec(out)?.[1] ?? '';
    const decoded = attribute.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(JSON.parse(decoded)).toEqual(props);
  });

  it('is the marker of an island among the elements of a page, and the rest of the page is plain markup', () => {
    expect(
      html(
        <main>
          <h1>Title</h1>
          <Island name="hello" component={Hello} />
          <p>Static</p>
        </main>,
      ),
    ).toBe('<main><h1>Title</h1><div data-island="hello" style="display: contents;"><p>Hello</p></div><p>Static</p></main>');
  });
});

describe('Slot on a server', () => {
  it('writes the content it is given inside a marker, for the browser to move into the island that replaces the markup', () => {
    expect(html(<Slot>{() => <pre>code</pre>}</Slot>)).toBe(
      '<div data-slot="content" style="display: contents;"><!----><pre>code</pre></div>',
    );
    expect(html(<Slot name="code">{() => <i>x</i>}</Slot>)).toBe('<div data-slot="code" style="display: contents;"><!----><i>x</i></div>');
  });

  it('is in the island that has it, and the props that the browser reads do not hold the content, which is a function', () => {
    const Block = (props: { title: string; content?: () => JSXElement }) => (
      <figure>
        <figcaption>{props.title}</figcaption>
        <Slot>{props.content}</Slot>
      </figure>
    );
    const page = html(<Island name="block" component={Block} props={{ title: 'T', content: () => <pre>code</pre> }} />);
    expect(page).toContain('data-props="{&quot;title&quot;:&quot;T&quot;}"');
    expect(page).toContain('<div data-slot="content" style="display: contents;"><!----><pre>code</pre></div>');
  });

  it('is empty when it has nothing to write, and marks its region for a page that is hydrated', () => {
    expect(html(<Slot />)).toBe('<div data-slot="content" style="display: contents;"><!----></div>');
    expect(renderToString(<Slot>{() => <b>x</b>}</Slot>, { hydratable: true }).html).toBe(
      '<div data-slot="content" style="display: contents;"><!----><b><!--t-->x</b><!--/--></div>',
    );
  });
});
