---
description: What pipis is, how it differs from other frameworks, and what it costs in bytes.
tags: [getting-started, size, react]
---
# Introduction

_pipis_ is a small front-end framework for building UIs in JSX, with no virtual DOM and no build magic. You write components as you would in React, but a component runs once, and a state change goes straight to the DOM node that shows it: nothing else re-runs.

```tsx live title="A first component"
import { reactive, select } from 'pipis';

export default function Counter() {
  const count = reactive(0);
  const label = select(count, (n) => `Clicked ${n} times`);
  return <button onclick={() => (count.value = count.value + 1)}>{label}</button>;
}
```

## Why?

- **Only what changed updates.** There is no diffing and no memoization to think about. A reactive value bound to a text node costs about as much to write as the text node does directly (150 ns against 119 ns in the benchmark), and changing one field of one row of a 10,000-row `ReactiveList` takes 1.3 ms ([ADR 4](../adr/0004-list-rows.md)).
- **Tiny.** The core (`createElement` and text nodes) is about 0.8 KB gzipped. A counter app with reactive state is about 1.1 KB, and importing every export is about 2.4 KB. Each feature costs only what you import (`If` +0.14 KB, `List` +0.33 KB, `Suspense` +0.37 KB). These are measured by `node tools/size.ts` and held by a CI check ([ADR 15](../adr/0015-size.md)). Your app's code is the bundle.
- **No hooks, no re-renders.** A component runs once and returns an element. There are no dependency arrays, no stale closures, and no rules of hooks.
- **Just functions.** An element is a function that inserts its content into the DOM: call it with a parent node to mount, call it with nothing to unmount. Stack traces look normal, and nothing is hidden from you.
- **Bring your own state.** Use the built-in `reactive`, or use a Zustand or Redux store, an RxJS Observable, a signal or any other state with `adapt` ([the cookbook](../guide/cookbook.md)).

## What it needs

A DOM, and a browser that has ES2015 built-ins (`Map`, `Set`, `Symbol`). The package ships its source as written, with ES2020 and ES2021 syntax, so an app that targets an older browser must lower `node_modules/pipis` with its bundler ([ADR 16](../adr/0016-platform-floor.md)).

## Where next

- [Getting started](getting-started.md) installs it and builds a small app.
- The [guide](../guide/reactive-values.md) covers reactive values, dynamic content and the utilities.
- If you know React, [Comparison with React](../guide/comparison-with-react.md) maps what you know onto what is here.
- The [API reference](../reference/api.md) lists every export.
- The decisions behind the design, each with the tests and measurements that could show it wrong, are in [docs/adr](../adr/README.md).
