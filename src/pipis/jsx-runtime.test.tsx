/** @jsxRuntime automatic */
/** @jsxImportSource . */

import { describe, expect, it } from 'vite-plus/test';
import { Fragment as RuntimeFragment, jsx, jsxs } from './jsx-runtime.ts';
import { Fragment as DevFragment, jsxDEV } from './jsx-dev-runtime.ts';
import { Fragment } from './core.ts';
import type { ChildrenProp, JSXElement } from './base.ts';
import { reactive, select } from './reactive.ts';
import { If, List } from './dynamic.ts';
import { html, mount } from '../test/dom.ts';

describe('the JSX runtime', () => {
  it('turns a tag into an element and a function into a call of that component', () => {
    const Box = ({ children }: ChildrenProp): JSXElement => jsx('section', { children });
    const { root } = mount(jsx(Box, { children: 'inside' }));
    expect(html(root)).toBe('<section>inside</section>');
  });

  it('treats jsxs, which marks static children, the same as jsx', () => {
    expect(jsxs).toBe(jsx);
  });

  it('has a dev entry that ignores the extra arguments the compiler passes', () => {
    const { root } = mount(jsxDEV('p', { children: 'dev' }, 'key', true, { fileName: 'a.tsx', lineNumber: 1, columnNumber: 1 }, undefined));
    expect(html(root)).toBe('<p>dev</p>');
  });

  it('exports the same Fragment from every entry point', () => {
    expect(RuntimeFragment).toBe(Fragment);
    expect(DevFragment).toBe(Fragment);
  });
});

describe('JSX syntax', () => {
  it('renders elements, text and fragments', () => {
    const { root } = mount(
      <>
        <h1>title</h1>
        text
      </>,
    );
    expect(html(root)).toBe('<h1>title</h1>text');
  });

  it('binds a reactive child and a reactive attribute', () => {
    const name = reactive('a');
    const { root } = mount(<p title={select(name, (n) => `hello ${n}`)}>{name}</p>);
    name.value = 'b';
    expect(root.firstElementChild?.getAttribute('title')).toBe('hello b');
    expect(root.textContent).toBe('b');
  });

  it('passes props through to a component, and renders List and If written as tags', () => {
    const show = reactive(true);
    const ids = reactive<readonly number[]>([1, 2]);
    const Item = ({ id }: { id: number }) => <li>{id}</li>;
    const { root } = mount(
      <ul>
        <If condition={show}>
          <List items={ids} itemKey={(id) => id}>
            {(id) => <Item id={id} />}
          </List>
        </If>
      </ul>,
    );
    expect(html(root)).toBe('<ul><li>1</li><li>2</li></ul>');
    show.value = false;
    expect(html(root)).toBe('<ul></ul>');
  });
});
