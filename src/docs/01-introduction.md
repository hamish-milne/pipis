## Introduction

_pipis_ is a tiny front-end framework for building UIs in JSX — about 0.8 KB for the core, no virtual DOM, no build magic. Write components like you would in React, but state updates go straight to the DOM node that needs them, nothing else re-runs.

### Why?

- **Fast by default.** No vDOM, no diffing, no memoization to think about. Only the DOM nodes bound to changed state ever update.
- **Tiny.** The core (`createElement` and text nodes) is about 0.8 KB gzipped. A counter app with reactive state is about 1.1 KB, and importing every export is about 2.4 KB. Each feature costs only what you import (`If` +0.14 KB, `List` +0.3 KB, `Suspense` +0.37 KB, for example). These are measured by `node tools/size.ts` and held by a CI check. Your app's code is the bundle.
- **No hooks, no re-renders.** Components run once and return a function that mounts and unmounts them. No dependency arrays, no stale closures, no rules of hooks.
- **Just functions.** An element is a function that inserts its content into the DOM: call it with a parent node to mount, call it with nothing to unmount. Stack traces look normal. Nothing is hidden from you.
- **Bring your own state.** Use the built-in `reactive` helper, or wire up Zustand, RxJS, or any other store, signal or Observable with `adapt` (see the cookbook).
