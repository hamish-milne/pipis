/** @jsxRuntime automatic */
/** @jsxImportSource ../src/pipis */

// What tools/server.test.ts renders twice: in jsdom with the browser's build of pipis, and as the server's build, and compares the
// markup. Each is a small piece of UI that an app might have. (The live examples of the documentation are compared too.)
import {
  Dynamic,
  ErrorBoundary,
  Fragment,
  Helmet,
  If,
  List,
  OneOf,
  ReactiveList,
  createElement,
  reactive,
  select,
  type JSXElement,
} from '../src/pipis/index.ts';

type Todo = { id: number; text: string; done: boolean };

function TodoRow(props: { todo: Todo }) {
  return (
    <li className="todo" data-done={props.todo.done}>
      <input type="checkbox" checked={props.todo.done} />
      <span style={{ textDecoration: props.todo.done ? 'line-through' : 'none' }}>{props.todo.text}</span>
    </li>
  );
}

export const cases: Record<string, () => JSXElement> = {
  'a paragraph with inline elements and entities': () => (
    <p>
      Fish &amp; chips, <em>1 &lt; 2</em> and <a href="/a?b=1&c=2">a link</a>
    </p>
  ),
  'a table': () => (
    <table className="grid">
      <thead>
        <tr>
          <th colSpan={2}>Name</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>a</td>
          <td>1</td>
        </tr>
      </tbody>
    </table>
  ),
  'a form': () => (
    <form action="/go" method="post">
      <label htmlFor="n">Name</label>
      <input id="n" name="n" type="text" placeholder="Your name" autocomplete="off" required maxLength={20} />
      <input type="checkbox" name="c" checked />
      <select name="s">
        <option value="a">A</option>
        <option value="b" selected>
          B
        </option>
      </select>
      <button type="submit" disabled>
        Send
      </button>
    </form>
  ),
  'svg with a viewBox and styled children': () => (
    <svg viewBox="0 0 10 10" width="10" height="10">
      <circle cx="5" cy="5" r="4" fill="red" />
      <g transform="translate(1 1)">
        <path d="M0 0L1 1" stroke="black" />
      </g>
      <linearGradient id="g">
        <stop offset="0" />
      </linearGradient>
    </svg>
  ),
  'reactive text, attributes and styles': () => {
    const count = reactive(3);
    const label = select(count, (n) => `Clicked ${n} times`);
    const cls = select(count, (n) => (n > 2 ? 'big' : 'small'));
    return (
      <button className={cls} title={label} style={{ color: select(count, (n) => (n > 2 ? 'red' : 'blue')), opacity: '0.5' }}>
        {label}
      </button>
    );
  },
  'adjacent text children': () => {
    const a = reactive('a');
    return (
      <p>
        {a}
        {'b'}
        {reactive('c')}
        {reactive('')}
        {1}
      </p>
    );
  },
  'empty and absent children': () => (
    <div>
      {null}
      {undefined}
      {''}
    </div>
  ),
  'a fragment of elements': () => (
    <>
      <h1>Title</h1>
      <>
        <p>one</p>
        <p>two</p>
      </>
    </>
  ),
  'if, true and false': () => (
    <div>
      <If condition={reactive(true)}>
        <b>yes</b>
      </If>
      <If condition={reactive(false)}>
        <b>no</b>
      </If>
    </div>
  ),
  oneof: () => (
    <OneOf selector={reactive(1)}>
      <i>zero</i>
      <b>one</b>
      <u>two</u>
    </OneOf>
  ),
  'a list of components': () => {
    const todos = reactive<readonly Todo[]>([
      { id: 1, text: 'write', done: true },
      { id: 2, text: 'test', done: false },
    ]);
    return (
      <ul>
        <List items={todos} itemKey={(t) => t.id}>
          {(t) => <TodoRow todo={t} />}
        </List>
      </ul>
    );
  },
  'a reactive list with rows that follow their item': () => {
    const todos = reactive<readonly Todo[]>([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
    ]);
    return (
      <ol>
        <ReactiveList items={todos} itemKey={(t) => t.id}>
          {(t) => <li data-done={select(t, 'done')}>{select(t, 'text')}</li>}
        </ReactiveList>
      </ol>
    );
  },
  'an empty list': () => (
    <ul>
      <List items={reactive<readonly number[]>([])} itemKey={(n) => n}>
        {(n) => <li>{n}</li>}
      </List>
    </ul>
  ),
  'dynamic content': () => <Dynamic value={reactive({ n: 7 })}>{(v) => <p>{v.n}</p>}</Dynamic>,
  'nested structure': () => {
    const rows = reactive([1, 2, 3]);
    const show = reactive(true);
    return (
      <section>
        <If condition={show}>
          <OneOf selector={select(rows, (r) => r.length)}>
            <p>none</p>
            <p>one</p>
            <p>two</p>
            <ul>
              <List items={rows} itemKey={(n) => n}>
                {(n) => (
                  <li>
                    <If condition={select(reactive(n), (v) => v % 2 === 1)}>
                      <b>{n}</b>
                    </If>
                  </li>
                )}
              </List>
            </ul>
          </OneOf>
        </If>
      </section>
    );
  },
  'an error boundary that catches': () => {
    const Bad = (): JSXElement => (parent) => {
      if (parent) throw new Error('bad');
      return null;
    };
    return (
      <div>
        <ErrorBoundary fallback={() => <p>fallback</p>}>
          <Bad />
        </ErrorBoundary>
      </div>
    );
  },
  'text that needs escaping everywhere': () => (
    <div title={'"quoted" & more'} data-x={"it's"}>
      {'<script>alert("x")</script> & more'}
    </div>
  ),
  'a custom element': () => createElement('my-widget' as 'div', { className: 'w', children: 'inside' }),
  'pre and textarea': () => (
    <div>
      <pre>{'line one\nline two'}</pre>
      <textarea value="some text" />
    </div>
  ),
  'html in the document head': () => (
    <main>
      <Helmet>
        <title>A page</title>
        <meta name="description" content="about it" />
      </Helmet>
      <h1>Hi</h1>
    </main>
  ),
  // A prop that is given nothing is no attribute, in the browser's build and on the server alike; an empty string is an empty attribute.
  'props that are given nothing': () => (
    <a
      href={undefined}
      title={undefined}
      className={undefined}
      tabIndex={undefined}
      id=""
      lang="en"
      aria-label={undefined}
      aria-hidden={false}
      data-gone={null as never}
      draggable={false}
    >
      text
    </a>
  ),
  // The types refuse these, so they are made without them: a prop on a tag that does not have it is nothing the browser writes.
  'props that the tag does not have': () =>
    createElement('div', {
      children: [
        createElement('ul', { start: undefined, children: createElement('li', { value: 3, children: 'a' }) } as never),
        createElement('ol', { start: 4, children: createElement('li', { children: 'b' }) }),
        createElement('div', { value: 'x', checked: true, selected: true } as never),
        createElement('input', { value: 'v', checked: false }),
      ],
    }),
  'a component with children': () => {
    const Card = (props: { title: string; children?: JSXElement }) => (
      <section className="card">
        <h2>{props.title}</h2>
        {props.children}
      </section>
    );
    return (
      <Card title="T">
        <Fragment>
          <p>body</p>
        </Fragment>
      </Card>
    );
  },
};
