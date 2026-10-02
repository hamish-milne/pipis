# Cookbook

A collection of patterns and recipies for integrating other libraries with _pipis_.

## Zustand

The Store object from `zustand/vanilla` already has a `subscribe` function, so all we need to do is wrap them with `adapt`:

```tsx
import { createStore } from "zustand/vanilla";
import { adapt, select } from "pipis";

const store = adapt(
  createStore((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 })),
  })),
);

function App() {
  return (
    <div>
      <p>Count: {select(store, (s) => s.count)}</p>
      <button onclick={store.increment}>Increment</button>
    </div>
  );
}
```

## RxJS

RxJS `Observables` have a `subscribe` function, so they can also be `adapt`ed:

```tsx
import { type Observable, BehaviorSubject, interval } from "rxjs";
import { adapt } from "pipis";

const myInterval = interval(1000);
const myState = new BehaviorSubject(0);

function App() {
  return (
    <>
      <p>Time: {adapt(myInterval)}</p>
      <p>Count: {adapt(myState)}</p>
      <button onclick={() => myState.next(myState.value + 1)}>
    </>
  );
}
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
