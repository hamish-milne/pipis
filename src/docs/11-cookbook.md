# Cookbook

A collection of patterns and recipies for integrating other libraries with _pipis_.

## State libraries and Observables

`adapt` turns a store, signal or Observable into a reactive value without changing it. A reactive value gives its subscriber the current value as soon as it is subscribed to, and `subscribe` returns a way to stop. Libraries differ in whether they do that, so there are three recipes:

- **The library's `subscribe` already gives the current value** (Svelte stores, Nanostores, Preact Signals, RxJS `BehaviorSubject`): `adapt(source)`. A returned RxJS `Subscription` is handled.
- **It does not** (Zustand, Redux, XState): `adapt(source, () => source.getState())`. The function is called for the first value and again on every change, whatever the library passes to its listener.
- **It has a different method** (Valtio, Jotai): `adapt({ subscribe }, current)`, with a `subscribe` that calls the callback with no arguments.

The `adapt` call in each example below is run against the real library in `src/pipis/interop.test.ts`, which checks that the current value shows at once (including one set before mounting), that changes are followed, and that nothing stays subscribed once the element is removed.

### Zustand

```tsx
import { createStore } from "zustand/vanilla";
import { adapt, select } from "pipis";

const store = createStore<{ count: number; increment: () => void }>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

// Zustand's subscribe does not give the current state, so say how to read it.
const count = select(adapt(store, () => store.getState()), "count");

function App() {
  return (
    <div>
      <p>Count: {count}</p>
      <button onclick={store.getState().increment}>Increment</button>
    </div>
  );
}
```

### Redux

```tsx
import { legacy_createStore as createStore } from "redux";
import { adapt, select } from "pipis";

type State = { count: number };
const store = createStore((state: State = { count: 0 }, action: { type: "increment" }) =>
  action.type === "increment" ? { count: state.count + 1 } : state,
);

const count = select(adapt(store, () => store.getState()), "count");

function App() {
  return (
    <>
      <p>Count: {count}</p>
      <button onclick={() => store.dispatch({ type: "increment" })}>Increment</button>
    </>
  );
}
```

### XState

An actor's `getSnapshot()` is its current value. Call it through a function, as it needs its `this`:

```tsx
import { assign, createActor, createMachine } from "xstate";
import { adapt, select } from "pipis";

const machine = createMachine({
  context: { count: 0 },
  on: { increment: { actions: assign({ count: ({ context }) => context.count + 1 }) } },
});
const actor = createActor(machine).start();

const count = select(adapt(actor, () => actor.getSnapshot()), (snapshot) => snapshot.context.count);

function App() {
  return (
    <>
      <p>Count: {count}</p>
      <button onclick={() => actor.send({ type: "increment" })}>Increment</button>
    </>
  );
}
```

### RxJS

A `BehaviorSubject` has a current value and gives it at once. A plain `Subject` or an `interval` has none until it emits, so it shows nothing (an empty text node) until then.

```tsx
import { BehaviorSubject, interval } from "rxjs";
import { adapt } from "pipis";

const myInterval = interval(1000);
const myState = new BehaviorSubject(0);

function App() {
  return (
    <>
      <p>Time: {adapt(myInterval)}</p>
      <p>Count: {adapt(myState)}</p>
      <button onclick={() => myState.next(myState.value + 1)}>Increment</button>
    </>
  );
}
```

### Svelte stores

Any store from `svelte/store` (`writable`, `readable`, `derived`) works as it is:

```tsx
import { writable } from "svelte/store";
import { adapt } from "pipis";

const count = writable(0);

function App() {
  return (
    <>
      <p>Count: {adapt(count)}</p>
      <button onclick={() => count.update((n) => n + 1)}>Increment</button>
    </>
  );
}
```

### Nanostores

```tsx
import { atom } from "nanostores";
import { adapt } from "pipis";

const count = atom(0);

function App() {
  return (
    <>
      <p>Count: {adapt(count)}</p>
      <button onclick={() => count.set(count.get() + 1)}>Increment</button>
    </>
  );
}
```

### Preact Signals

```tsx
import { signal } from "@preact/signals-core";
import { adapt } from "pipis";

const count = signal(0);

function App() {
  return (
    <>
      <p>Count: {adapt(count)}</p>
      <button onclick={() => (count.value = count.value + 1)}>Increment</button>
    </>
  );
}
```

### Valtio

Valtio's `subscribe` is a function that takes the proxy, so wrap it. Pass `true` for it to notify at once, as pipis does; by default it batches to a microtask.

```tsx
import { proxy, snapshot, subscribe } from "valtio/vanilla";
import { adapt, select } from "pipis";

const state = proxy({ count: 0 });

const count = select(
  adapt({ subscribe: (callback: () => void) => subscribe(state, callback, true) }, () => snapshot(state)),
  "count",
);

function App() {
  return (
    <>
      <p>Count: {count}</p>
      <button onclick={() => state.count++}>Increment</button>
    </>
  );
}
```

### Jotai

```tsx
import { atom, createStore } from "jotai/vanilla";
import { adapt } from "pipis";

const store = createStore();
const countAtom = atom(0);

const count = adapt({ subscribe: (callback: () => void) => store.sub(countAtom, callback) }, () => store.get(countAtom));

function App() {
  return (
    <>
      <p>Count: {count}</p>
      <button onclick={() => store.set(countAtom, store.get(countAtom) + 1)}>Increment</button>
    </>
  );
}
```

### Anything else

If a library has a way to read the current value and a way to be told when it changes, it fits the third recipe:

```tsx
adapt({ subscribe: (callback) => theLibrary.onChange(callback) }, () => theLibrary.read());
```

## HighlightJS

```tsx
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";

hljs.registerLanguage("typescript", typescript);

export function HighlightJS({ children, language }: { children: string; language?: string }) {
  return (
    <code
      className={language ? `language-${language}` : undefined}
      ref={(el) => {
        el.textContent = children;
        hljs.highlightElement(el);
      }}
    />
  );
}
```

## Chart.js

```tsx
import {
  Chart,
  registerables,
  type ChartType,
  type ChartOptions,
  type ChartDataset,
} from "chart.js";
import { type Reactive, Watch } from "pipis";
Chart.register(...registerables);

export function ChartJS<TType extends ChartType>({
  type,
  data,
  options,
}: {
  type: TType;
  data: Reactive<ChartDataset<TType>[]>;
  options: Reactive<ChartOptions<TType>>;
}) {
  let chart!: Chart<TType>;
  function setCanvasRef(el: HTMLCanvasElement) {
    chart = new Chart(el, { type });
  }

  return (
    <>
      <canvas ref={setCanvasRef} />
      <Watch value={options}>
        {(newValue) => {
          chart.options = newValue;
          chart.update();
        }}
      </Watch>
      <Watch value={data}>
        {(newValue) => {
          chart.data.datasets = newValue;
          chart.update();
        }}
      </Watch>
    </>
  );
}
```
