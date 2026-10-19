# pipis — reference for AI coding agents

pipis is a small JSX UI framework with **no virtual DOM, no re-rendering and no hooks**. Read this whole file before writing code. Sections are ordered by how much they matter. A checklist to run before you answer is at the end.

Everything is imported by name from `"pipis"`. There is no default export. Do not invent sub-paths: the only others are `pipis/jsx-runtime` and `pipis/jsx-dev-runtime`, which the compiler imports for JSX and you never write. Never import from `react`.

To use JSX, the project's `tsconfig.json` needs `"jsx": "react-jsx"` and `"jsxImportSource": "pipis"` (and its bundler the same import source: Vite `esbuild: { jsxImportSource: "pipis" }`). A single file can instead start with `/** @jsxImportSource pipis */`. pipis needs a DOM and ES2015 built-ins (`Map`, `Set`, `Symbol`); its source uses newer syntax (`??`, `?.`, `??=`), which a bundler targeting an older browser must lower.

## 1. The mental model (5 rules)

1. **A component function runs ONCE**, when it is created. It builds elements and returns them. It never runs again, so nothing in its body re-evaluates when state changes.
2. **State is `reactive(initial)`.** Read and write it through `.value`, but only inside callbacks: event handlers, `Effect` bodies, `select` functions. Never read `.value` while building JSX or in the component body.
3. **To display state, pass the reactive object itself into JSX**, as a child or as an attribute value. pipis subscribes and updates exactly that DOM node. You never touch the DOM yourself.
4. **Anything computed from state is a `select(...)`**: a ternary, a comparison, a negation, arithmetic, a template string. That includes attribute values (`className`, `disabled`, `style` values). Parts of the UI that appear, disappear, switch or change in number use `If`, `OneOf` and `List`. Plain `&&`, ternaries and `.map()` over reactive state do NOT update.
5. **Side effects** (listeners, timers, animation loops, anything that needs cleanup) go in `Effect`, never in the component body.

A reactive is not a plain object. `row.name` or `state.running` on a reactive is a type error: in JSX use `select(row, "name")`. In a callback, read state with `.value` (`state.value.running`). Only `reactive(...)` state has `.value`: a `select(...)` result is a read-only derived value with NO `.value`, so in a callback recompute from the source state (`products.value.find(...)`) and never write `row.value`.

Update state by assigning a new value (`x.value = ...`) or, for object state, with `patch(x, { a: 3 })`. Never mutate it in place.

## 2. Quickstart: a complete app

```tsx
import { reactive, select } from "pipis";

function Counter() {
  const count = reactive(0); // state
  const label = select(count, (n) => `Clicked ${n} times`); // derived value

  return (
    // .value is read inside the handler (a callback), not in the JSX itself
    <button onclick={() => (count.value = count.value + 1)}>
      {label}
    </button>
  );
}

// Mount: calling a component gives an Element; calling the Element with a parent node mounts it.
Counter()(document.body);
```

If the project already has a main file that mounts your component, do not mount it yourself. Export it instead (`export default Counter;`) and the main file calls `Counter()(document.body)`. When asked for one self-contained file, define AND mount.

## 3. I want to... so use...

| I want to...                                                    | Use                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| show or hide something                                          | `<If condition={reactiveBoolean}>`                                  |
| choose one view out of several                                  | `<OneOf selector={reactiveKey}>{{a: <A/>, b: <B/>}}</OneOf>`        |
| render a list that changes                                      | `<ReactiveList items={reactiveItems} itemKey={...}>` if a row's item can change, else `<List>` (see mistake 11) |
| swap a whole unrelated subtree (rare)                           | `<Dynamic value={reactive}>`                                        |
| compute a value from other state                                | `select(source, fn)`                                                |
| read one field of an object state, in JSX                       | `select(source, "field")`                                           |
| text, class, `disabled` or a style value that depends on state  | `select(source, fn)` passed as the attribute / child                |
| position or size from state                                     | `style={{ left: select(x, (v) => `${v}px`) }}` (strings with units) |
| add a listener, timer or animation loop (needs cleanup)         | `<Effect>` (as the FIRST child of its parent)                       |
| run code every time a value changes                             | `<Watch value={reactive}>`                                          |
| fetch data                                                      | `<Suspense promise emptyData loading>{(data) => ...}</Suspense>`    |
| change some fields of an object state                           | `patch(state, { field: value })`                                    |
| render somewhere else in the DOM / into `<head>`                | `Portal` + `PortalTarget` / `Helmet`                                |
| share a value with deep descendants                             | `defineContext`                                                     |
| get a DOM node                                                  | `ref` prop, then use the node inside an `Effect`                    |
| pass a static value where a Reactive is expected                | `constant(value)`                                                   |
| combine several state values                                    | keep them in ONE reactive object and `select` fields off it        |

**Exports** (import only these): `reactive, select, patch, constant, isReactive, subscribe, adapt, defineContext, withErrorHandler, getErrorHandler, handleError, subscribeWithCatch, If, OneOf, List, ReactiveList, Dynamic, Effect, effect, Watch, Suspense, ErrorBoundary, Portal, PortalTarget, Helmet, Fragment, emptyElement`, plus the low-level `createElement, textNode, createMarker, moveNode, setRef, dynamic`. Types are exported too (for example `type JSXElement`). Import every name you use.

## 4. If you know React: habits that break here

| React habit                         | pipis                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `useState(0)`                       | `reactive(0)`                                                                 |
| `setX(prev => prev + 1)`            | `x.value = x.value + 1` (inside a callback)                                   |
| `{x}` re-renders on change          | the component never re-runs; `{x}` works only if `x` is a reactive object     |
| `{x === "a" ? "A" : "B"}`           | `{select(x, (v) => (v === "a" ? "A" : "B"))}`                                 |
| `{cond && <A/>}`, ternaries         | `<If condition={cond}><A/></If>` (cond must be a reactive boolean; a plain ternary is fine for a constant) |
| `{items.map(...)}` on changing data | `<List items={ids} itemKey={(id) => id}>{(id) => ...}</List>`                 |
| `key={...}`                         | no `key` prop exists; static `.map()` needs no keys, changing lists use `List`|
| `useEffect(fn, [])`                 | `<Effect>{() => { ...; return cleanup }}</Effect>`                            |
| `useEffect(fn, [dep])`              | `<Watch value={dep}>{(v) => ...}</Watch>`                                     |
| `useMemo`                           | `select(source, fn)` (or just compute inline if static)                       |
| `useCallback`                       | not needed, there is no re-render cost                                        |
| `createContext` / `useContext`      | `defineContext`; resolved at construction time; pass a `Reactive<T>` to make it dynamic |
| `onClick`, `onSubmit`, `onKeyDown`  | `onclick`, `onsubmit`, `onkeydown` (native lowercase DOM names)               |
| `onChange` (fires per keystroke)    | `oninput`. The native `onchange` fires only when the value is committed.      |
| `className`                         | `className` on HTML elements (same as React). SVG elements use `class`.       |
| `style={{ left: 10 }}`              | `style={{ left: "10px" }}`: values are strings WITH units, or a Reactive<string> |
| `ref`                               | same prop, but it fires at CONSTRUCTION, not mount (see mistake 7)            |

## 5. Common mistakes (wrong, then right)

### 1. Computing from state while building JSX
Reading `.value` in JSX is evaluated once and never updates. Any ternary, comparison or arithmetic over state needs `select`, including attribute values.
```tsx
// WRONG: evaluated once at construction, never updates
<p>{count.value} clicks</p>
<button disabled={!running.value}>{running.value ? "Stop" : "Start"}</button>
<div className={active.value ? "bg-green-500" : "bg-slate-300"} />
<div style={{ transform: dark.value ? "translateX(24px)" : "none", width: `${ball.value.r * 2}px` }} />
// RIGHT: pass the reactive itself, or derive with select
<p>{count} clicks</p>
<button disabled={select(running, (r) => !r)}>{select(running, (r) => (r ? "Stop" : "Start"))}</button>
<div className={select(active, (a) => (a ? "bg-green-500" : "bg-slate-300"))} />
<div style={{ transform: select(dark, (d) => (d ? "translateX(24px)" : "none")), width: select(ball, (b) => `${b.r * 2}px`) }} />
```

### 2. Treating a reactive like a plain object
```tsx
// WRONG: `row` and `state` are Reactives, not plain objects (type error)
<p>{row.name}</p>
if (state.running) { ... }
if (status === "won") { ... }
// RIGHT: in JSX select a field; in callbacks read .value
<p>{select(row, "name")}</p>
onclick={() => { if (state.value.running) { ... } }}
const label = select(status, (s) => (s === "won" ? "YOU WIN!" : "GAME OVER"));

// WRONG: a select() result has no .value (type error: Property 'value' does not exist on type 'Reactive<Product>')
const row = select(products, (l) => l.find((p) => p.id === id)!);
onclick={() => remove(row.value.id)}
// RIGHT: in callbacks use the id you already have, or read the source state
onclick={() => remove(id)}
```

### 3. Conditionals and lists over reactive state
```tsx
// WRONG: these run once and never update
{show.value && <Panel />}
{show && <Panel />}
{todos.value.map((t) => <li>{t.text}</li>)}
{laps.value.length ? <LapList /> : <p>No laps</p>}
{nameErr && <p>{nameErr}</p>}      // nameErr is a Reactive object, which is always truthy
<If condition={show.value}>...</If> // type error: condition must be a Reactive<boolean>, not a boolean
// RIGHT
<If condition={show}><Panel /></If>
<If condition={select(nameErr, (e) => e !== "")}><p>{nameErr}</p></If>
<OneOf selector={select(laps, (l) => (l.length ? "some" : "none"))}>{{ some: <LapList />, none: <p>No laps</p> }}</OneOf>
<List items={ids} itemKey={(id) => id}>{(id) => <TodoRow id={id} />}</List>
```
`.map()` is fine only for static arrays (an array literal that never changes), and it needs no `key`. Likewise a plain ternary or `&&` is fine for a condition that never changes after construction (a constant, a fixed prop). `If` is for reactive conditions only and its `condition` must be a `Reactive<boolean>`.

### 4. Mutating state in place
```tsx
// WRONG: no new reference, so nothing is notified
todos.value.push(item);
game.value.paddleX = 10;
game.value.bricks[3].alive = false;
oninput={(e) => (state.value.filter = e.target.value)}
// RIGHT: assign a new value, or patch object state
todos.value = [...todos.value, item];
patch(game, { paddleX: 10 });
oninput={(e) => patch(state, { filter: e.target.value })}
patch(game, { bricks: game.value.bricks.map((b, i) => (i === 3 ? { ...b, alive: false } : b)) });
```
`patch(state, partial)` merges plain objects key by key (nested objects too). Primitives and arrays in `partial` replace the old value outright, so changing one array element means passing the whole new array.

### 5. Side effects in the component body
```tsx
// WRONG: the component body must have no side effects or subscriptions
function Box() {
  window.addEventListener("keydown", onKey);
  return <div />;
}
// RIGHT: do it in an Effect and return the cleanup
function Box() {
  return (
    <div>
      <Effect>{() => {
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }}</Effect>
    </div>
  );
}
```

### 6. Where to put `Effect`
Put `Effect` as the FIRST child of its parent. Children mount right to left, so the siblings after it are attached before it runs. That is required when the effect uses a DOM node (focus, measuring); for a pure timer or listener the order does not matter, but first is always safe.
```tsx
// WRONG when the effect needs the node: it runs before the node exists
<div><input ref={setInput} /><Effect>{focusIt}</Effect></div>
// RIGHT
<div><Effect>{focusIt}</Effect><input ref={setInput} /></div>
```

### 7. Using a DOM node inside a `ref` callback
`ref` fires at construction, when the node is probably not in the document yet.
```tsx
// WRONG: focus() does nothing on a detached node
<input ref={(el) => el.focus()} />
// RIGHT: capture the node, act on it inside an Effect
let input: HTMLInputElement | undefined;
// ...
<div>
  <Effect>{() => { input?.focus(); }}</Effect>
  <input ref={(el) => (input = el)} />
</div>
```

### 8. `select` goes stale when it reads other state through a closure
`select` recomputes only when its INPUT reactive changes, not when something it reads inside the callback changes.
```tsx
const sel = reactive({ category: "a", sortKey: "name" });
const category = select(sel, "category"); // only fires when category changes
// WRONG: reads sel.value.sortKey inside, but only re-runs on category changes -> stale
const top = select(category, (c) => pick(c, sel.value.sortKey));
// RIGHT: derive from the broadest reactive that actually changes
const top = select(sel, (s) => pick(s.category, s.sortKey));
```

### 9. `select` takes exactly two arguments
The second argument is EITHER a key OR a function, never both. There is no multi-input form and no `combine()` or `merge()`. Keep related state in ONE reactive object, replace it wholesale, and `select` with one function over the whole object.
```tsx
// WRONG: three arguments (type error). Neither "key, then fn" nor several inputs exist.
const left = select(state, "ballX", (x) => `${x}px`);
const total = select(price, qty, (p, q) => p * q);
// RIGHT: one function over the whole object
const left = select(state, (s) => `${s.ballX}px`);
const cart = reactive({ price: 3, qty: 2 });
const total = select(cart, (c) => c.price * c.qty);
cart.value = { ...cart.value, qty: 5 };
```

### 10. Update loops
Never set a reactive from its own subscriber, nor (transitively) from a child's `Watch` on a value the parent derives from. That overflows the stack. Even when it terminates, notification is synchronous and unbatched: the nested write is delivered at once, ahead of the notification still running, so a subscriber after the writer sees the newer value first and the older one last, and ends up showing a stale value.
```tsx
// WRONG: Watch on x writes x
<Watch value={x}>{(v) => { x.value = v + 1; }}</Watch>
```

### 11. `List` rows: rows that change need `ReactiveList`
`List` passes each row function the plain array item (not a reactive), keyed by `itemKey`. The row function runs ONCE per key and is reused afterwards, so a `List` row never sees a later change to its item. When a row shows data that can change while its key stays the same, use `ReactiveList` instead: its row function is given the item as a `Reactive`, updated whenever the item for that key changes (by `!==`), and you `select` fields from it.
```tsx
// WRONG: `p` was captured once for this key, so p.quantity goes stale
<List items={products} itemKey={(p) => p.id}>{(p) => <li>{p.quantity}</li>}</List>
// WRONG: with ReactiveList the row's item is a Reactive, not the item (type error)
<ReactiveList items={products} itemKey={(p) => p.id}>{(p) => <li>{p.quantity}</li>}</ReactiveList>
// RIGHT: the list is the array of items itself; each row selects what it shows
<ReactiveList items={products} itemKey={(p) => p.id}>
  {(product) => {
    const name = select(product, "name");
    const quantity = select(product, "quantity");
    const lineTotal = select(product, (p) => (p.price * p.quantity).toFixed(2));
    return <li>{name} x {quantity} = {lineTotal}</li>; // product is a Reactive: never product.name here
  }}
</ReactiveList>
```
Change an item by putting a NEW object for it in a new array (`products.value = products.value.map((p) => (p.id === id ? { ...p, quantity: 9 } : p))`): a row whose item is the same object is not touched, so only the changed row recomputes, and one change costs one pass over the array however many rows there are (1.3 ms at 10,000 rows). Use `List` for items that never change in place (add, remove, reorder only); it is a little smaller and its rows hold no reactive. `items` must be a Reactive for both. For a fixed array use `constant(array)`, or plain `.map()`. The `index` a row function is given is its index when the row was made; it does not follow later reordering.

### 12. React event names
```tsx
// WRONG: React names
<button onClick={fn} /> <input onChange={fn} /> <form onSubmit={fn} />
// RIGHT: native lowercase names. React's onChange is oninput (fires on every keystroke).
<button onclick={fn} /> <input oninput={fn} /> <form onsubmit={fn} />
```
These native names apply to DOM elements. Your own components can name their callback props anything (`<Toast onClose={fn} />` is fine).

### 13. `key` props
There is no `key` prop (type error). Fixed children need no keys, and changing lists use `List`.
```tsx
// WRONG: key does not exist
{TABS.map((t) => <button key={t}>{t}</button>)}
// RIGHT: static array, no key
{TABS.map((t) => <button>{t}</button>)}
```

### 14. `class`, and style values
On HTML elements `class` is not an attribute: use `className` (SVG elements are the exception, see section 8). `style` is an object with one entry per CSS property. Each value is a string WITH units, or a `Reactive<string>`. Numbers are a type error, and the object itself is not reactive: wrap each changing value in its own `select`.
```tsx
// WRONG
<div class="box" style={{ left: 10, top: `${y.value}px` }} />
// RIGHT
<div className="box" style={{ color: "red", left: select(x, (v) => `${v}px`), top: select(y, (v) => `${v}px`) }} />
```

### 15. Returning a raw array where one element is required
Arrays of elements (such as `.map()` results) can be mixed freely with other children inside HTML elements, fragments and `If`. But a function that must return a single `JSXElement` (a component, or the child function of `List`, `Dynamic` or `Suspense`) cannot return a raw array: wrap siblings in a fragment.
```tsx
// FINE: a static child mixed with a mapped array
<div><span />{items.map((i) => <b>{i}</b>)}</div>
// WRONG: a raw array is not a JSXElement
<List items={ids} itemKey={(id) => id}>{(id) => [<dt>{id}</dt>, <dd>x</dd>]}</List>
// RIGHT: wrap siblings in a fragment
<List items={ids} itemKey={(id) => id}>{(id) => <><dt>{id}</dt><dd>x</dd></>}</List>
```

### 16. `Dynamic` for ordinary updates
`Dynamic` rebuilds its whole subtree on every change.
```tsx
// WRONG: recreates the span on every keystroke
<Dynamic value={text}>{(t) => <span>{t}</span>}</Dynamic>
// RIGHT
<span>{text}</span>
```

### 17. Imports
```tsx
// WRONG: default import, React imports, or a name you forgot to import (If is used below)
import pipis from "pipis";
import React, { useState } from "react";
// RIGHT: named imports of everything you use, nothing from react
import { reactive, select, If } from "pipis";
```

### 18. `Suspense` is not React's Suspense
There is no `fallback` or `success` prop. The loading UI is the `loading` prop, `emptyData` is an empty value of the data type, and the CHILD is a function of the loaded data.
```tsx
// WRONG: React style
<Suspense fallback={<p>Loading...</p>}><UserCard /></Suspense>
// RIGHT
<Suspense promise={load} emptyData={{ name: "" }} loading={<p>Loading...</p>}>
  {(user) => <p>{select(user, "name")}</p>}
</Suspense>
```

## 6. Worked examples

### Todo list
Shows: array state with whole-value replacement, `ReactiveList` so each row is given its todo as a reactive value and only re-fires when THAT todo changes, reactive `data-*` driving CSS, `empty:hidden`.

```tsx
import { reactive, select, ReactiveList, type ReactiveReadonly } from "pipis";

type Todo = { id: number; text: string; done: boolean };
let nextId = 0;

function TodoApp() {
  const todos = reactive<readonly Todo[]>([]);
  const draft = reactive("");

  function addTodo() {
    const text = draft.value.trim();
    if (!text) return;
    todos.value = [...todos.value, { id: nextId++, text, done: false }]; // whole-array replace
    draft.value = "";
  }
  function toggleTodo(id: number) {
    todos.value = todos.value.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  // The row is given its todo as a reactive value: select what it shows from it. It re-fires only when THIS todo changes.
  function todoRow(todo: ReactiveReadonly<Todo>) {
    const text = select(todo, "text");
    const done = select(todo, "done");
    return (
      <li>
        <button onclick={() => toggleTodo(todo.value.id)} data-done={done}>
          ✓
        </button>
        <span data-done={done} className="data-done:line-through">
          {text}
        </span>
      </li>
    );
  }

  const remaining = select(todos, (list) => list.filter((t) => !t.done).length);

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
      {/* the ul is hidden via CSS :empty, no If/OneOf needed */}
      <ul className="empty:hidden">
        <ReactiveList items={todos} itemKey={(t) => t.id}>
          {todoRow}
        </ReactiveList>
      </ul>
    </div>
  );
}

TodoApp()(document.body);
```

### Moving box: animation loop, keyboard, reactive styles
Shows: all changing values in ONE reactive object updated with `patch`, derived values (`select`) for style, text and `disabled`, `.value` read only inside callbacks (the key handler, the frame loop, the click handlers), and listeners plus a `requestAnimationFrame` loop created in an `Effect` that is the first child and returns its cleanup. Use this shape for games, timers and anything that runs continuously. Style values are strings with units.

```tsx
import { reactive, select, patch, Effect } from "pipis";

type Box = { x: number; speed: number; running: boolean };

function Mover() {
  const box = reactive<Box>({ x: 0, speed: 2, running: true });
  const left = select(box, (b) => `${b.x}px`); // style values are strings WITH units
  const speedLabel = select(box, (b) => `speed ${b.speed}`);
  const pauseLabel = select(box, (b) => (b.running ? "Pause" : "Resume"));
  const atMaxSpeed = select(box, (b) => b.speed >= 10);

  return (
    <div className="space-y-2">
      <div className="relative h-16 overflow-hidden rounded bg-slate-100">
        {/* Effect is the FIRST child. Everything it starts is undone by the returned function. */}
        <Effect>
          {() => {
            const onKey = (e: KeyboardEvent) => {
              if (e.key === "ArrowUp") patch(box, { speed: Math.min(10, box.value.speed + 1) });
              if (e.key === "ArrowDown") patch(box, { speed: Math.max(0, box.value.speed - 1) });
            };
            window.addEventListener("keydown", onKey);

            let frame = requestAnimationFrame(function loop() {
              const b = box.value;
              if (b.running) patch(box, { x: (b.x + b.speed) % 300 });
              frame = requestAnimationFrame(loop);
            });

            return () => {
              window.removeEventListener("keydown", onKey);
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

Mover()(document.body);
```

### Gallery
Shows: `select()` to derive the active item from an id, and `Dynamic` used correctly (coarse-grained: swapping an entire unrelated subtree, here a whole example app, never for routine leaf updates).

```tsx
import { reactive, select, Dynamic, type JSXElement } from "pipis";

function Hello() {
  return <p>Hello, world!</p>;
}

function Counter() {
  const count = reactive(0);
  return <button onclick={() => (count.value = count.value + 1)}>Clicked {count} times</button>;
}

type Example = { id: string; label: string; component: () => JSXElement };
const examples: [Example, ...Example[]] = [
  { id: "hello", label: "Hello", component: Hello },
  { id: "counter", label: "Counter", component: Counter },
];

function Gallery() {
  const selected = reactive(examples[0].id);
  const current = select(selected, (id) => examples.find((e) => e.id === id) ?? examples[0]);

  return (
    <div>
      <nav>
        {examples.map((example) => {
          const isSelected = select(selected, (id) => id === example.id);
          const tabClass = select(isSelected, (active) => (active ? "active" : ""));
          return (
            <button onclick={() => (selected.value = example.id)} className={tabClass}>
              {example.label}
            </button>
          );
        })}
      </nav>
      {/* Dynamic fully recreates the chosen example's DOM and state on every switch. Fine here: switches are rare and the subtrees are unrelated. */}
      <Dynamic value={current}>{(example) => example.component()}</Dynamic>
    </div>
  );
}

// Mount the component to the body. This goes in your 'main' module.
Gallery()(document.body);
```

## 7. API reference

### State

```ts
reactive<T>(initial: T): ReactiveState<T>   // .value get/set; notifies subscribers only when the new value is !== the old one
type Cleanup = () => void
type Reactive<T> = { readonly [REACTIVE]: true; subscribe(cb: (v: T) => void): Cleanup }
type ReactiveReadonly<T> = Reactive<T> & { get value(): T }
type ReactiveState<T> = ReactiveReadonly<T> & { set value(v: T) }
type MaybeReactive<T> = Reactive<T> | T
select(input: Reactive<A>, compute: (a: A) => B): Reactive<B>
select(input: Reactive<A>, key: keyof A): Reactive<A[key]>   // dedupes via !==. Exactly two arguments: a key OR a function, never both. Computed once PER SUBSCRIBER, not shared.
patch<T>(state: ReactiveState<T>, partial: DeepPartial<T>): void   // update object state without spreading: deep-merges `partial` into a new object and assigns it to state.value; primitives and arrays are replaced outright
constant<T>(value: T): ReactiveReadonly<T>   // a static value wrapped as a reactive
isReactive(value): boolean
subscribe(reactive, cb)                      // same as reactive.subscribe(cb)
adapt(source, current?)                      // a Reactive from another library's store/signal/Observable (new object, the source is untouched). subscribe(cb) must give the current value at once and return a cleanup function or a Subscription: pass the source alone (RxJS BehaviorSubject, Svelte, Nanostores, Preact Signals). Otherwise (Zustand, Redux, XState) also pass a getter: adapt(store, () => store.getState()). Valtio and Jotai: adapt({ subscribe }, current). See the cookbook
defineContext<T>(defaultValue): [provider, consumer]
withErrorHandler / getErrorHandler           // a defineContext<ErrorHandler> pair; default handler is console.error
handleError(fn, errReturnVal?)               // wraps fn, catches a sync throw, calls the handler that was current WHEN handleError WAS CALLED, returns errReturnVal
subscribeWithCatch(reactive, cb)             // reactive.subscribe(handleError(cb))
```

- Use `select(obj, "field")` for plain field reads. Use the callback form only for real computation (formatting, combining, defaulting, comparing).
- Passing a `Reactive<T>` as an attribute or child of an HTML element subscribes on mount and unsubscribes on unmount. In your own components, props pass through unchanged: a reactive value flows down to whichever leaf element uses it.
- A reactive `Content` value (`string | number | false | null | undefined`) renders `false`, `null` and `undefined` as empty text. So `select(obj, "optionalField")` is safe directly as JSX content, with no `?? ""` needed (add one only if you want a different displayed value).
- Context: `provider(value, () => ...)` runs the inner function with `value` pushed. `consumer()` returns the nearest value and is resolved at CONSTRUCTION time, so pass a `Reactive<T>` as the value if it must change.
- **Gating pattern for optional data.** Instead of `T | undefined` props with null checks scattered around, mount the component only once data is known-good (via `OneOf` or `If`). Give it a module-level `const EMPTY_X: X = {...}` dummy, do `select(maybeUndefinedSource, (v) => v ?? EMPTY_X)` once, and pass the always-defined `Reactive<X>` down.

### Components and elements

- A lowercase tag is an intrinsic HTML or SVG element. (MathML tags are accepted by the types but are not given the MathML namespace.) A tag that is neither, which the types do not allow, is created as an `SVGElement` rather than the `HTMLUnknownElement` you might expect. An uppercase tag is a component function. `<Foo x={1} />` is the same as `Foo({ x: 1 })`.
- `<>...</>` (`Fragment`) renders no wrapper node and collapses to its single child when it has one or zero children.
- Intrinsic element types come from the DOM typings. On HTML elements use `className` (not `class`); on SVG elements use `class`. Use native lowercase event names. Handlers automatically narrow `event.target` to the element's type, so no casting is needed.
- Attribute types follow the DOM typings. `style` values are strings (with units). A numeric attribute takes whatever type the DOM declares for it: `min`, `max` and `value` on an `<input>` are strings (`min="0"`, `value={select(n, String)}`), while on `<meter>` and `<progress>` they are numbers. SVG attributes are all strings (see section 8). Any attribute value can also be a `Reactive` of its type.
- `ref` accepts a callback `(node) => void` or any object with a settable `.value`, so a `reactive` works as a ref. It fires at CONSTRUCTION time (see mistake 7).

```ts
type Content = string | number | false | null | undefined   // renders as a text node; null/undefined/false = empty
type ChildrenProp = { children?: JSXChild | readonly JSXChild[] }
type RefProp<T> = { ref?: ((instance: T) => void) | { set value(v: T | null | undefined) } }
emptyElement: JSXElement                     // renders nothing
Fragment({ children }): JSXElement
```

### Structure and effects

```ts
If({ condition: Reactive<boolean>, children }): JSXElement
```
```tsx
<If condition={select(todos, (l) => l.length > 0)}><ClearButton /></If>
```

```ts
OneOf<T extends PropertyKey>({ selector: Reactive<T>, children: Partial<Record<T, JSXElement>> }): JSXElement
```
`children` is a plain object literal used as ordinary JSX content. Do not call `OneOf({...})` directly instead of using JSX.
```tsx
<OneOf selector={sel}>{{ a: <X />, b: <Y /> }}</OneOf>
```

```ts
List<T>({ items: Reactive<readonly T[]>, itemKey: (item: T, i: number) => PropertyKey, children: (item: T, i: number) => JSXElement }): JSXElement
```
```ts
ReactiveList<T>({ items: Reactive<readonly T[]>, itemKey: (item: T, i: number) => PropertyKey, children: (item: ReactiveReadonly<T>, i: number) => JSXElement }): JSXElement
```
Keyed reorder, add and remove without recreating unaffected rows. `item` is the plain array item, not a reactive. For rows whose item changes in place use `ReactiveList` (mistake 11). The row function runs once per key and the row is then reused, so treat items as immutable, make `itemKey` unique per item, and iterate over ids when row data can change (mistake 11). `items` must be a Reactive.

```ts
Dynamic<T>({ value: Reactive<T>, children: (v: T) => JSXElement }): JSXElement
```
Recreates the whole DOM subtree on every change. Prefer `List` and `OneOf`. Use only for coarse swaps of unrelated subtrees.

```ts
Effect: (props: { children: () => Cleanup | undefined }) => JSXElement   // runs on mount, cleanup on unmount
effect(fn: () => Cleanup | undefined): JSXElement                         // same thing as a function
```
`Effect` is a JSX component (`<Effect>{() => ...}</Effect>`); the function form is lowercase `effect(fn)`, and calling `Effect(() => ...)` is a type error. Make `Effect` the FIRST child of its parent element (see mistake 6). It runs on mount only; it does not re-run when state changes. Use `Watch` for that.

```ts
Watch<T>({ value: Reactive<T>, children: (v: T) => void }): JSXElement   // runs on mount AND on every change
```
```tsx
<Watch value={query}>{(q) => { document.title = q; }}</Watch>
```

```ts
Suspense<T>({
  promise: (() => Promise<T>) | Reactive<Promise<T>>,
  emptyData: T,
  loading?: JSXElement,
  error?: (err: ReactiveReadonly<unknown>) => JSXElement,
  children: (data: ReactiveReadonly<T>) => JSXElement,
}): JSXElement
```
A `promise` function fetches once on mount. A `Reactive<Promise>` refetches whenever it is reassigned. `loading` (optional) is shown until the promise settles, `children` renders the loaded data and `error` (optional) renders a failure. If `loading` or `error` is omitted, `children` renders with `emptyData` in that state. `data` and `err` are reactives: render `data` directly (`{data}`) or take fields with `select(data, "field")`. `emptyData` is an empty value of type `T` (for example `""`, `[]` or `{ name: "" }`), so `data` is always fully typed and no null checks are needed. The error value is `unknown`, so derive its message with a callback.
```tsx
type User = { name: string };
<Suspense
  promise={() => fetch("/api/user").then((r) => r.json() as Promise<User>)}
  emptyData={{ name: "" }}
  loading={<p>Loading...</p>}
  error={(err) => <p>{select(err, (e) => (e instanceof Error ? e.message : String(e)))}</p>}
>
  {(user) => <p>{select(user, "name")}</p>}
</Suspense>
```

```ts
ErrorBoundary({ fallback: (err: ReactiveReadonly<unknown>) => JSXElement, children }): JSXElement
```
Catches errors anywhere under it, at any depth: a child that throws as it mounts, and a callback that throws on a later change (a `select` function, a `Watch` or `Effect` body, or the functions you give to `List`, `OneOf`, `If` and `Dynamic`). The nearest boundary wins; an error thrown by the fallback goes to the boundary outside it. It does NOT catch errors in event handlers, timers or promise callbacks; for those use `window.onerror` plus a reactive flag.
```tsx
<ErrorBoundary fallback={() => <p>Something broke</p>}><Risky /></ErrorBoundary>
```

```ts
type PortalTargetValue = readonly [Node, Node | null] | undefined
PortalTarget(props: RefProp<PortalTargetValue>): JSXElement   // marks a position, renders nothing
Portal({ target: Reactive<PortalTargetValue>, children }): JSXElement
Helmet(props: ChildrenProp): JSXElement                       // renders its children into document.head
```
`Portal` renders its children at the target's live position. Several Portals to one target insert in mount order.

## 8. Styling and DOM notes

- **`style`** is an object with one entry per CSS property. A value is a string with units (`"10px"`, `"50%"`) or a `Reactive<string>`: `style={{ color: "red", left: select(x, (v) => `${v}px`) }}`. The object itself is not reactive, and numbers are not accepted.
- **SVG elements** (`svg`, `path`, `circle`, `rect`, `g`, ...) get their attributes through `setAttribute`. So every SVG attribute value is a string (or a `Reactive<string>`), including numbers (`r="5"`, `stroke-width="2"`; give units where the SVG attribute needs them), names are used as written in SVG (`viewBox`, `stroke-width`, `stroke-linecap`, not React's `strokeWidth`), and the class attribute is `class`, not `className`. This applies to SVG elements only.
- **`data-*` props accept a `Reactive<boolean>` directly.** Truthy sets the dataset key; `null`, `undefined` or `false` deletes it. Tailwind's presence variant (`data-done:line-through`, no brackets) works off this. Use the bracket form (`data-[state=open]:...`) only for non-boolean string values. No ternary-to-string is needed.
- **Tailwind classes are static strings.** Do not build class names from state with template strings (`` `w-${n}` `` is invisible to Tailwind's scanner). Use `select` to choose between complete class names, or `style` for continuous values like positions.
- **`disabled={reactiveBoolean}`** is a normal property binding. Disabled buttons never fire `onclick`, so the handler needs no extra guard.
- **Component design:** accept raw `Reactive<T>` props (for example `price: Reactive<number>`) and do the `select()` formatting INSIDE the reusable display component, instead of taking a pre-formatted `string`. That keeps reactivity and avoids duplicating formatting at each call site. A caller with a static value wraps it: `constant(9.99)`.
- **CSS `:empty`** ignores empty-string text nodes and comment nodes (it is not strict "zero child nodes"). So `empty:hidden` works when a single reactive string drives the element (fold any label into the string, for example `` `Limit: ${text}` `` or `""`). It works only if that string is the element's ONLY child: a wrapping `<span>` always counts as a child and defeats it.

## 9. Internals (only if you build new primitives; ordinary apps never need this)

- An **Element** is `(parent?: Node, sibling?: Node | null) => Node | null`. Called with `parent`, it mounts: it inserts its content before `sibling` (or at the end if null) and returns a stable "head" node. Called with no arguments, it unmounts: it removes its nodes and cleans up subscriptions.
- The **head** is the leftmost node the element owns, or `sibling` unchanged if it renders nothing. It is fixed once mounted. If the content's shape can change, use a `Comment` marker as the head (`createMarker`, `dynamic`).
- Mounting again with the same parent and sibling is a cheap no-op. A different parent or sibling moves the content.
- **Children mount in REVERSE order** (rightmost first), because the `sibling` argument is the next node to the right. This is why `Effect` goes first: the siblings after it are attached before it runs.
- **Construction** (the component body) must be idempotent, with no side effects or subscriptions. **Mount** may have side effects, which should be reversible on unmount. Do not mutate app state during mount (except in `Portal`).

```ts
moveNode(element: ChildNode, parent: JSXParent, sibling?): void
textNode(content: Content | Reactive<Content>): JSXElement
createMarker(text?: string): Comment         // stable anchor node
createElement<T extends keyof IntrinsicElements>(type: T, props): JSXElement
  // The DOM node is created once and reused across mount/unmount cycles. Static props are set once; Reactive props are subscribed on mount and unsubscribed on unmount.
setRef<T>(props: RefProp<T>, value: T)
dynamic(mount: MountFn, unmount: Cleanup): JSXElement
  // MountFn = (parent, sibling) => Cleanup | void
  // Inserts a persistent Comment marker as the head before `sibling`, pre-mount. `mount` is called once per mount (guarded).
```

## 10. Checklist: verify before you answer

1. Every pipis name you use is imported by name from `"pipis"`. Nothing comes from `react`. There is no default import.
2. The file mounts (`App()(document.body)`), or exports the component (`export default App`) when a main file mounts it.
3. No `.value` inside JSX or in the component body. Anything computed (ternary, comparison, negation, arithmetic, template string) is a `select`, including `className`, `disabled` and style values.
4. Fields of a reactive are read with `select(r, "field")` in JSX and `state.value.field` in callbacks. Only `reactive()` state has `.value`; a `select()` result does not. `select` takes exactly two arguments: a key OR a function, never both.
5. Conditionals use `If` or `OneOf`. Changing lists use `List` (over ids when rows change). No `key` props.
6. State is assigned a new value (`x.value = ...`) or updated with `patch(x, { a: 1 })`, never mutated.
7. Listeners, timers and animation loops live in an `Effect` (first child) that returns a cleanup.
8. Native event names on DOM elements (`onclick`, `oninput`, `onsubmit`), `className` on HTML (`class` on SVG), and style values that are strings with units.
