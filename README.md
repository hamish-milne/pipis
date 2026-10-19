# pipis

A small front-end framework for JSX, with no virtual DOM and no re-rendering. A component runs once, and a state change goes straight to the DOM node that shows it.

```tsx
import { reactive, select } from 'pipis';

function Counter() {
  const count = reactive(0);
  const label = select(count, (n) => `Clicked ${n} times`);
  return <button onclick={() => (count.value = count.value + 1)}>{label}</button>;
}

Counter()(document.body);
```

## Why?

- **Only what changed updates.** There is no diffing and no memoization to think about. Only the DOM nodes bound to changed state are touched.
- **Tiny.** The core is about 0.8 KB gzipped, a counter app about 1.1 KB, and every export together about 2.4 KB. Each feature costs only what you import. These numbers are measured and held by a check in CI.
- **No hooks, no re-renders.** No dependency arrays, no stale closures, no rules of hooks.
- **Just functions.** An element is a function: call it with a parent node to mount, with nothing to unmount.
- **Bring your own state.** Use the built-in `reactive`, or a Zustand or Redux store, an RxJS Observable, a signal or anything else, with `adapt`.

## Install

```sh
npm install pipis
```

Tell TypeScript and your bundler to take JSX from pipis. In `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "pipis" } }
```

pipis needs a DOM and a browser with ES2015 built-ins. It ships its source as written, with ES2020 and ES2021 syntax, so an app that targets older browsers lowers `node_modules/pipis` with its bundler.

## Documentation

- [Getting started](https://github.com/neofox-solutions/pipis/blob/main/docs/start/getting-started.md)
- [The guide](https://github.com/neofox-solutions/pipis/blob/main/docs/README.md): reactive values, dynamic UI, utilities, and a comparison with React
- [API reference](https://github.com/neofox-solutions/pipis/blob/main/docs/reference/api.md)
- [Design decisions](https://github.com/neofox-solutions/pipis/blob/main/docs/adr/README.md), each with the tests and measurements that could show it wrong
- [`LLM.md`](https://github.com/neofox-solutions/pipis/blob/main/LLM.md): a reference written for AI coding agents, which also ships in the package

Every example in the documentation is compiled in CI, and every live one is run.

## Contributing

See [CONTRIBUTING.md](https://github.com/neofox-solutions/pipis/blob/main/CONTRIBUTING.md) and [RUNBOOKS.md](https://github.com/neofox-solutions/pipis/blob/main/RUNBOOKS.md).

## License

MIT. Copyright (c) 2026 Neofox Solutions LLP and Hamish Milne.
