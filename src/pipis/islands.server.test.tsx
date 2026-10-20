/** @jsxRuntime automatic */
/** @jsxImportSource . */

// What a server writes for an island. These run with `pipis` as the server's build (the `server` project in vite.config.ts).
import { describe, expect, it } from 'vite-plus/test';
import { reactive, select, type JSXElement } from './index.ts';
import { Island } from './islands.ts';
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
