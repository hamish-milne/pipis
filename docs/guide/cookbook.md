---
description: Using pipis with state libraries, Observables and libraries that draw into an element.
tags: [interop, types]
---
# Cookbook

A collection of recipes for using other libraries with pipis: state libraries and Observables through `adapt`, and libraries that draw into an element.

## State libraries and Observables

`adapt` turns a store, signal or Observable into a reactive value without changing it. A reactive value gives its subscriber the current value as soon as it is subscribed to, and `subscribe` returns a way to stop. Libraries differ in whether they do that, so there are three recipes:

- **The library's `subscribe` already gives the current value** (Svelte stores, Nanostores, Preact Signals, RxJS `BehaviorSubject`): `adapt(source)`. A returned RxJS `Subscription` is handled.
- **It does not** (Zustand, Redux, XState): `adapt(source, () => source.getState())`. The function is called for the first value and again on every change, whatever the library passes to its listener.
- **It has a different method** (Valtio, Jotai): `adapt({ subscribe }, current)`, with a `subscribe` that calls the callback with no arguments.

The `adapt` call in each example below is run against the real library in `src/pipis/interop.test.ts`, which checks that the current value shows at once (including one set before mounting), that changes are followed, and that nothing stays subscribed once the element is removed.

### Zustand

```tsx check title="Zustand"
import { createStore } from "zustand/vanilla";
import { adapt, select } from "pipis";

const store = createStore<{ count: number; increment: () => void }>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

// Zustand's subscribe does not give the current state, so say how to read it.
const count = select(adapt(store, () => store.getState()), "count");

export function App() {
  return (
    <div>
      <p>Count: {count}</p>
      <button onclick={store.getState().increment}>Increment</button>
    </div>
  );
}
```

### Redux

```tsx check title="Redux"
import { legacy_createStore as createStore } from "redux";
import { adapt, select } from "pipis";

type State = { count: number };
const store = createStore((state: State = { count: 0 }, action: { type: "increment" }) =>
  action.type === "increment" ? { count: state.count + 1 } : state,
);

const count = select(adapt(store, () => store.getState()), "count");

export function App() {
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

```tsx check title="XState"
import { assign, createActor, createMachine } from "xstate";
import { adapt, select } from "pipis";

const machine = createMachine({
  context: { count: 0 },
  on: { increment: { actions: assign({ count: ({ context }) => context.count + 1 }) } },
});
const actor = createActor(machine).start();

const count = select(adapt(actor, () => actor.getSnapshot()), (snapshot) => snapshot.context.count);

export function App() {
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

```tsx check title="RxJS"
import { BehaviorSubject, interval } from "rxjs";
import { adapt } from "pipis";

const myInterval = interval(1000);
const myState = new BehaviorSubject(0);

export function App() {
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

```tsx check title="Svelte stores"
import { writable } from "svelte/store";
import { adapt } from "pipis";

const count = writable(0);

export function App() {
  return (
    <>
      <p>Count: {adapt(count)}</p>
      <button onclick={() => count.update((n) => n + 1)}>Increment</button>
    </>
  );
}
```

### Nanostores

```tsx check title="Nanostores"
import { atom } from "nanostores";
import { adapt } from "pipis";

const count = atom(0);

export function App() {
  return (
    <>
      <p>Count: {adapt(count)}</p>
      <button onclick={() => count.set(count.get() + 1)}>Increment</button>
    </>
  );
}
```

### Preact Signals

```tsx check title="Preact Signals"
import { signal } from "@preact/signals-core";
import { adapt } from "pipis";

const count = signal(0);

export function App() {
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

```tsx check title="Valtio"
import { proxy, snapshot, subscribe } from "valtio/vanilla";
import { adapt, select } from "pipis";

const state = proxy({ count: 0 });

const count = select(
  adapt({ subscribe: (callback: () => void) => subscribe(state, callback, true) }, () => snapshot(state)),
  "count",
);

export function App() {
  return (
    <>
      <p>Count: {count}</p>
      <button onclick={() => state.count++}>Increment</button>
    </>
  );
}
```

### Jotai

```tsx check title="Jotai"
import { atom, createStore } from "jotai/vanilla";
import { adapt } from "pipis";

const store = createStore();
const countAtom = atom(0);

const count = adapt({ subscribe: (callback: () => void) => store.sub(countAtom, callback) }, () => store.get(countAtom));

export function App() {
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

```tsx check title="A library with a different shape"
import { adapt } from "pipis";

// A made-up library with a way to read a value and a way to be told it changed
declare const theLibrary: { onChange(callback: () => void): () => void; read(): number };

export const value = adapt({ subscribe: (callback: () => void) => theLibrary.onChange(callback) }, () => theLibrary.read());
```

## highlight.js

A component that highlights the code it is given. The node is made once by pipis and highlighted in its `ref`; no other part of pipis needs to know about it.

```tsx check title="HighlightJS"
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

A component that draws a chart into a canvas and updates it when its reactive `data` and `options` change. The chart is made when the canvas is, and each `Watch` pushes the new value into it.

```tsx check title="Chart.js"
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
    chart = new Chart(el, { type, data: { datasets: [] } });
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
