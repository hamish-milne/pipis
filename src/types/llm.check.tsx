/** @jsxRuntime automatic */
/** @jsxImportSource pipis */

/**
 * The code in LLM.md, as the compiler sees it. This file is never run: `tsc` (the `check` task) is the test.
 *
 * - Each WRONG snippet that is a type error is a statement under `@ts-expect-error`. If pipis's types ever start to accept it,
 *   the directive is unused and `tsc` fails, so LLM.md cannot keep telling a model that something is a type error when it is not.
 * - Each RIGHT snippet is compiled as written, so LLM.md cannot keep recommending code that does not type-check.
 *
 * Snippets that are wrong only at runtime (reading `.value` while building JSX, say) are not here: they type-check, which is why
 * LLM.md has to warn about them. They are not run either; `src/pipis/*.test.ts` covers the behaviour.
 *
 * Imports are from "pipis" itself, as in LLM.md, which also checks that the package's `exports` resolve.
 */
import { hydrate } from 'pipis/hydrate';
import { Island, mountIslands } from 'pipis/islands';
import { renderToString, serializeData } from 'pipis/server';
import {
  IS_CLIENT,
  Dynamic,
  Effect,
  ErrorBoundary,
  Helmet,
  If,
  List,
  OneOf,
  Portal,
  ReactiveList,
  PortalTarget,
  Suspense,
  Watch,
  adapt,
  constant,
  defineContext,
  patch,
  reactive,
  select,
  type JSXElement,
  type PortalTargetValue,
  type Reactive,
  type ReactiveReadonly,
  type ReactiveState,
} from 'pipis';

type Row = { name: string; quantity: number; price: number };
declare const row: Reactive<Row>;
declare const state: ReactiveState<{ running: boolean; filter: string; ballX: number }>;
declare const status: ReactiveState<string>;
declare const show: ReactiveState<boolean>;
declare const count: ReactiveState<number>;
declare const running: ReactiveState<boolean>;
declare const active: ReactiveState<boolean>;
declare const dark: ReactiveState<boolean>;
declare const x: ReactiveState<number>;
declare const y: ReactiveState<number>;
declare const ball: ReactiveState<{ r: number }>;
declare const ids: ReactiveState<readonly number[]>;
declare const price: ReactiveState<number>;
declare const qty: ReactiveState<number>;
declare const nameErr: ReactiveState<string>;
declare const laps: ReactiveState<readonly number[]>;
declare const todos: ReactiveState<readonly { id: number; text: string; done: boolean }[]>;
declare const fn: () => void;
declare const TABS: readonly string[];

const Panel = (): JSXElement => <div />;
const LapList = (): JSXElement => <ul />;

// ---- 5.1 Computing from state while building JSX: RIGHT ----

export function mistake1Right() {
  return [
    <p>{count} clicks</p>,
    <button disabled={select(running, (r) => !r)}>{select(running, (r) => (r ? 'Stop' : 'Start'))}</button>,
    <div className={select(active, (a) => (a ? 'bg-green-500' : 'bg-slate-300'))} />,
    <div
      style={{
        transform: select(dark, (d) => (d ? 'translateX(24px)' : 'none')),
        width: select(ball, (b) => `${b.r * 2}px`),
      }}
    />,
  ];
}

// ---- 5.2 Treating a reactive like a plain object ----

export function mistake2Wrong() {
  return [
    // @ts-expect-error a Reactive has no `name`: use select(row, "name")
    <p>{row.name}</p>,
    // @ts-expect-error a Reactive has no `running`: read state.value.running in a callback
    state.running,
    // @ts-expect-error a Reactive<string> is never equal to a string: derive with select
    status === 'won',
    // @ts-expect-error a select() result has no `.value`
    row.value,
  ];
}

export function mistake2Right() {
  const label = select(status, (s) => (s === 'won' ? 'YOU WIN!' : 'GAME OVER'));
  return [
    <p>{select(row, 'name')}</p>,
    <button
      onclick={() => {
        if (state.value.running) fn();
      }}
    />,
    label,
  ];
}

// ---- 5.3 Conditionals and lists over reactive state ----

export function mistake3Wrong() {
  return [
    // @ts-expect-error condition must be a Reactive<boolean>, not a boolean
    <If condition={show.value}>
      <Panel />
    </If>,
  ];
}

export function mistake3Right() {
  return [
    <If condition={show}>
      <Panel />
    </If>,
    <If condition={select(nameErr, (e) => e !== '')}>
      <p>{nameErr}</p>
    </If>,
    <OneOf selector={select(laps, (l) => (l.length ? 'some' : 'none'))}>{{ some: <LapList />, none: <p>No laps</p> }}</OneOf>,
    <List items={ids} itemKey={(id) => id}>
      {(id) => <p>{id}</p>}
    </List>,
  ];
}

// ---- 5.4 Mutating state in place ----

export function mistake4Wrong() {
  // @ts-expect-error a readonly array cannot be pushed to: assign a new array
  todos.value.push({ id: 1, text: 'x', done: false });
}

export function mistake4Right() {
  todos.value = [...todos.value, { id: 1, text: 'x', done: false }];
  patch(state, { ballX: 10 });
  return <input oninput={(e) => patch(state, { filter: e.target.value })} />;
}

// ---- 5.5 and 5.6 Effects ----

export function mistake5Right() {
  const onKey = () => {};
  return (
    <div>
      <Effect>
        {() => {
          window.addEventListener('keydown', onKey);
          return () => window.removeEventListener('keydown', onKey);
        }}
      </Effect>
    </div>
  );
}

export function mistake6Right() {
  let input: HTMLInputElement | undefined;
  const focusIt = () => {
    input?.focus();
    return undefined;
  };
  return (
    <div>
      <Effect>{focusIt}</Effect>
      <input ref={(el) => (input = el)} />
    </div>
  );
}

// ---- 5.8 and 5.9 select ----

export function mistake8And9() {
  const sel = reactive({ category: 'a', sortKey: 'name' });
  const category = select(sel, 'category');
  const top = select(sel, (s) => `${s.category}:${s.sortKey}`);
  const cart = reactive({ price: 3, qty: 2 });
  const total = select(cart, (c) => c.price * c.qty);
  cart.value = { ...cart.value, qty: 5 };
  const left = select(state, (s) => `${s.ballX}px`);
  return [category, top, total, left];
}

export function mistake9Wrong() {
  return [
    // @ts-expect-error select takes a key or a function, never both
    select(state, 'ballX', (n: number) => `${n}px`),
    // @ts-expect-error there is no multi-input select
    select(price, qty, (p: number, q: number) => p * q),
  ];
}

// ---- 5.11 List rows ----

export function mistake11Right() {
  const products = reactive<readonly (Row & { id: number })[]>([]);
  const productIds = select(products, (list) => list.map((p) => p.id));
  return (
    <List items={productIds} itemKey={(id) => id}>
      {(id) => {
        // LLM.md writes `.find(...)!` here; the repository forbids `!`, so this falls back to a placeholder row.
        const placeholder = { id, name: '', quantity: 0, price: 0 };
        const product = select(products, (list) => list.find((p) => p.id === id) ?? placeholder);
        const name = select(product, 'name');
        const quantity = select(product, 'quantity');
        const lineTotal = select(product, (p) => (p.price * p.quantity).toFixed(2));
        return (
          <li>
            {name} x {quantity} = {lineTotal}
          </li>
        );
      }}
    </List>
  );
}

export function mistake11ReactiveListRight() {
  const products = reactive<readonly (Row & { id: number })[]>([]);
  // The list is the array of items itself, and each row is given its item as a reactive value.
  return (
    <ReactiveList items={products} itemKey={(p) => p.id}>
      {(product) => (
        <li>
          {select(product, 'name')} x {select(product, 'quantity')} = {select(product, (p) => (p.price * p.quantity).toFixed(2))}
        </li>
      )}
    </ReactiveList>
  );
}

export function mistake11ReactiveListWrong() {
  const products = reactive<readonly (Row & { id: number })[]>([]);
  return (
    <ReactiveList items={products} itemKey={(p) => p.id}>
      {/* @ts-expect-error the row's item is a Reactive, not the item: select a field from it */}
      {(product) => <li>{product.name}</li>}
    </ReactiveList>
  );
}

export function mistake11Constant() {
  return (
    <List items={constant(['a', 'b'])} itemKey={(item) => item}>
      {(item) => <li>{item}</li>}
    </List>
  );
}

// ---- 5.12 Event names ----

export function mistake12Wrong() {
  return [
    // @ts-expect-error React's name: the DOM property is lowercase `onclick`
    <button onClick={fn} />,
    // @ts-expect-error React's onChange is `oninput` here
    <input onChange={fn} />,
  ];
}

// `HTMLFormElement` has a string index signature in the DOM typings (for its named controls), which would let any misspelt prop through.
// The intrinsic element types drop it, so a `<form>` is checked like every other element.
export function formIsCheckedLikeAnyOther() {
  return [
    // @ts-expect-error React's name: use `onsubmit`
    <form onSubmit={fn} />,
    // @ts-expect-error `class` is not a property of an HTML element: use className
    <form class="x" />,
    <form onsubmit={fn} className="x" method="post" action="/x" noValidate />,
  ];
}

export function mistake12Right() {
  return [<button onclick={fn} />, <input oninput={fn} />, <form onsubmit={fn} />];
}

// ---- 5.13 key ----

export function mistake13Wrong() {
  // @ts-expect-error there is no `key` prop
  return TABS.map((t) => <button key={t}>{t}</button>);
}

export function mistake13Right() {
  return TABS.map((t) => <button>{t}</button>);
}

// ---- 5.14 class and style values ----

export function mistake14Wrong() {
  return [
    // @ts-expect-error `class` is not a property of an HTML element: use className
    <div class="box" />,
    // @ts-expect-error style values are strings with units, not numbers
    <div style={{ left: 10 }} />,
  ];
}

export function mistake14Right() {
  return <div className="box" style={{ color: 'red', left: select(x, (v) => `${v}px`), top: select(y, (v) => `${v}px`) }} />;
}

// ---- 5.15 Raw arrays ----

export function mistake15Wrong() {
  return (
    <List
      items={ids}
      itemKey={(id) => id}
      // @ts-expect-error a row must be one JSXElement, not an array
      children={(id) => [<dt>{id}</dt>, <dd>x</dd>]}
    />
  );
}

export function mistake15Right() {
  return [
    <div>
      <span />
      {TABS.map((t) => (
        <b>{t}</b>
      ))}
    </div>,
    <List items={ids} itemKey={(id) => id}>
      {(id) => (
        <>
          <dt>{id}</dt>
          <dd>x</dd>
        </>
      )}
    </List>,
  ];
}

// ---- 5.16 Dynamic ----

export function mistake16Right() {
  const text = reactive('a');
  return [<span>{text}</span>, <Dynamic value={text}>{(t) => <span>{t}</span>}</Dynamic>];
}

// ---- 5.17 Imports ----

// @ts-expect-error there is no default export
import pipis from 'pipis';
export const defaultImportIsAnError = pipis;

// ---- 5.18 Suspense ----

export function mistake18Wrong() {
  const loadingUi = <p>Loading...</p>;
  const child = (d: ReactiveReadonly<string>) => <p>{d}</p>;
  const load = () => Promise.resolve('a');
  return [
    <Suspense fallback={loadingUi}>
      {/* @ts-expect-error the child of Suspense is a function of the data, not an element */}
      <Panel />
    </Suspense>,
    // @ts-expect-error there is no `fallback` prop: the loading UI is `loading`
    <Suspense promise={load} emptyData="" fallback={loadingUi} children={child} />,
    // @ts-expect-error there is no `success` prop: the child is the function of the data
    <Suspense promise={load} emptyData="" success={loadingUi} children={child} />,
  ];
}

export function mistake18Right() {
  const load = () => Promise.resolve({ name: 'a' });
  return (
    <Suspense promise={load} emptyData={{ name: '' }} loading={<p>Loading...</p>}>
      {(user) => <p>{select(user, 'name')}</p>}
    </Suspense>
  );
}

// ---- 7 API reference ----

export function effectIsAComponent() {
  // @ts-expect-error Effect is a JSX component taking `{ children }`; the function form is the lowercase effect()
  Effect(() => undefined);
}

export function api() {
  const [provide, consume] = defineContext('default');
  const value = provide('x', () => consume());
  const store = adapt({ subscribe: (cb: (v: number) => void) => (cb(1), () => {}) });
  const target = reactive<PortalTargetValue>(undefined);
  const promise = reactive(Promise.resolve('a'));
  return [
    value,
    select(store, (v: number) => v * 2),
    <ErrorBoundary fallback={() => <p>Something broke</p>}>
      <Panel />
    </ErrorBoundary>,
    <div>
      <PortalTarget ref={target} />
      <Portal target={target}>
        <b>moved</b>
      </Portal>
    </div>,
    <Helmet>
      <title>x</title>
    </Helmet>,
    <Watch value={count}>
      {(v) => {
        document.title = String(v);
      }}
    </Watch>,
    <Suspense promise={promise} emptyData="" error={(err) => <p>{select(err, (e) => (e instanceof Error ? e.message : String(e)))}</p>}>
      {(data) => <p>{data}</p>}
    </Suspense>,
  ];
}

// ---- 8 Styling and DOM notes ----

export function stylingNotes() {
  const done = reactive(false);
  return [
    <div data-done={done} />,
    <button disabled={select(running, (r) => !r)} onclick={fn} />,
    <svg width="100" height="100">
      <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" class="c" />
    </svg>,
  ];
}

// ---- 6 Worked examples ----

type Todo = { id: number; text: string; done: boolean };

export function TodoApp() {
  const todoList = reactive<readonly Todo[]>([]);
  const draft = reactive('');
  const todoIds = select(todoList, (list) => list.map((t) => t.id));
  let nextId = 0;

  function addTodo() {
    const text = draft.value.trim();
    if (!text) return;
    todoList.value = [...todoList.value, { id: nextId++, text, done: false }];
    draft.value = '';
  }
  function toggleTodo(id: number) {
    todoList.value = todoList.value.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  function todoRow(id: number) {
    const placeholder: Todo = { id, text: '', done: false };
    const todo = select(todoList, (list) => list.find((t) => t.id === id) ?? placeholder);
    const text = select(todo, 'text');
    const done = select(todo, 'done');
    return (
      <li>
        <button onclick={() => toggleTodo(id)} data-done={done}>
          ✓
        </button>
        <span data-done={done} className="data-done:line-through">
          {text}
        </span>
      </li>
    );
  }

  const remaining = select(todoList, (list) => list.filter((t) => !t.done).length);

  return (
    <div>
      <p>{remaining} left to do</p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          addTodo();
        }}
      >
        <input value={draft} oninput={(e) => (draft.value = e.target.value)} />
        <button type="submit">Add</button>
      </form>
      <ul className="empty:hidden">
        <List items={todoIds} itemKey={(id) => id}>
          {(id) => todoRow(id)}
        </List>
      </ul>
    </div>
  );
}

export function Mover() {
  type Box = { x: number; speed: number; running: boolean };
  const box = reactive<Box>({ x: 0, speed: 2, running: true });
  const left = select(box, (b) => `${b.x}px`);
  const speedLabel = select(box, (b) => `speed ${b.speed}`);
  const pauseLabel = select(box, (b) => (b.running ? 'Pause' : 'Resume'));
  const atMaxSpeed = select(box, (b) => b.speed >= 10);

  return (
    <div className="space-y-2">
      <div className="relative h-16 overflow-hidden rounded bg-slate-100">
        <Effect>
          {() => {
            const onKey = (e: KeyboardEvent) => {
              if (e.key === 'ArrowUp') patch(box, { speed: Math.min(10, box.value.speed + 1) });
              if (e.key === 'ArrowDown') patch(box, { speed: Math.max(0, box.value.speed - 1) });
            };
            window.addEventListener('keydown', onKey);

            let frame = requestAnimationFrame(function loop() {
              const b = box.value;
              if (b.running) patch(box, { x: (b.x + b.speed) % 300 });
              frame = requestAnimationFrame(loop);
            });

            return () => {
              window.removeEventListener('keydown', onKey);
              cancelAnimationFrame(frame);
            };
          }}
        </Effect>
        <div className="absolute top-4 h-8 w-8 rounded bg-indigo-500" style={{ left }} />
      </div>
      <p>{speedLabel}</p>
      <button onclick={() => patch(box, { running: !box.value.running })}>{pauseLabel}</button>
      <button disabled={atMaxSpeed} onclick={() => patch(box, { speed: box.value.speed + 1 })}>
        Faster
      </button>
    </div>
  );
}

export function Gallery() {
  type Example = { id: string; label: string; component: () => JSXElement };
  const examples: [Example, ...Example[]] = [
    { id: 'todo', label: 'Todo', component: TodoApp },
    { id: 'mover', label: 'Mover', component: Mover },
  ];
  const selected = reactive(examples[0].id);
  const current = select(selected, (id) => examples.find((e) => e.id === id) ?? examples[0]);

  return (
    <div>
      <nav>
        {examples.map((example) => {
          const isSelected = select(selected, (id) => id === example.id);
          const tabClass = select(isSelected, (isActive) => (isActive ? 'active' : ''));
          return (
            <button onclick={() => (selected.value = example.id)} className={tabClass}>
              {example.label}
            </button>
          );
        })}
      </nav>
      <Dynamic value={current}>{(example) => example.component()}</Dynamic>
    </div>
  );
}

// ---- 2 Quickstart ----

export function Counter() {
  const clicks = reactive(0);
  const label = select(clicks, (n) => `Clicked ${n} times`);
  return <button onclick={() => (clicks.value = clicks.value + 1)}>{label}</button>;
}

Counter()(document.body);

// ---- 7 API reference: the one-line examples, as LLM.md writes them ----

declare const ClearButton: () => JSXElement;
declare const X: () => JSXElement;
declare const Y: () => JSXElement;
declare const Risky: () => JSXElement;
declare const query: ReactiveState<string>;

type User = { name: string };

export function apiReferenceExamples() {
  const sel = reactive<'a' | 'b'>('a');
  return [
    <If condition={select(todos, (l) => l.length > 0)}>
      <ClearButton />
    </If>,
    <OneOf selector={sel}>{{ a: <X />, b: <Y /> }}</OneOf>,
    <Watch value={query}>
      {(q) => {
        document.title = q;
      }}
    </Watch>,
    <Suspense promise={() => fetch('/api/user').then((r) => r.json() as Promise<User>)} emptyData={{ name: '' }}>
      {(user) => <p>{select(user, 'name')}</p>}
    </Suspense>,
    <ErrorBoundary fallback={() => <p>Something broke</p>}>
      <Risky />
    </ErrorBoundary>,
  ];
}

/** The server rendering section of LLM.md. */
export function serverRenderingExamples() {
  const App = () => <p>hello</p>;
  // WRONG in LLM.md: `localStorage` on a server. RIGHT: guarded by a constant.
  const theme = reactive(IS_CLIENT ? (localStorage.getItem('theme') ?? 'light') : 'light');
  const { html, head } = renderToString(<App />);
  return [theme, html, head, serializeData({ a: 1 })];
}

/** The islands section of LLM.md. */
export function islandExamples() {
  const Counter = (props: { start: number }) => <button>{props.start}</button>;
  const page = <Island name="counter" component={Counter} props={{ start: 3 }} />;
  mountIslands({ counter: Counter });
  return page;
}

/** The hydration section of LLM.md. */
export function hydrationExamples(App: () => JSXElement) {
  const { html, head } = renderToString(<App />, { hydratable: true });
  // oxlint-disable-next-line typescript/no-non-null-assertion -- the line is LLM.md's, which is short on purpose
  hydrate(document.getElementById('app')!, <App />);
  return [html, head];
}
