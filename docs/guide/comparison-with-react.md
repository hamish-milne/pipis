---
description: What you know from React, in pipis terms.
tags: [react, components, reactivity]
---
# Comparison with React

If you know React, this page maps what you know onto pipis. The biggest difference is that a component runs **once**: there is no re-rendering, so a value that changes has to be reactive, and the JSX shows the reactive value itself and not a copy of what it held when the component ran.

| React                                     | pipis                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `useState(0)`                             | `reactive(0)`                                                                              |
| `setX(prev => prev + 1)`                  | `x.value = x.value + 1` (inside a callback)                                                |
| `{x}` re-renders on change                | the component never re-runs; `{x}` updates only if `x` is a reactive value                 |
| `{x === 'a' ? 'A' : 'B'}`                 | `{select(x, (v) => (v === 'a' ? 'A' : 'B'))}`                                              |
| `{cond && <A />}`, ternaries              | `<If condition={cond}><A /></If>` (`cond` must be a reactive boolean)                      |
| `{items.map(...)}` on changing data       | `<List>` or `<ReactiveList>`                                                               |
| `key={...}`                               | there is no `key` prop; a changing list uses `List` with an `itemKey`                      |
| `useEffect(fn, [])`                       | `<Effect>{() => { ...; return cleanup }}</Effect>`                                         |
| `useEffect(fn, [dep])`                    | `<Watch value={dep}>{(v) => ...}</Watch>`                                                  |
| `useMemo`                                 | `select(source, fn)`, or compute it in the component body if the inputs are static         |
| `useCallback`                             | not needed: there is no re-render to avoid                                                 |
| `createContext` and `useContext`          | `defineContext`, resolved when the component is constructed                                |
| `onClick`, `onSubmit`, `onKeyDown`        | `onclick`, `onsubmit`, `onkeydown`: the native lowercase names                             |
| `onChange` (fires on every keystroke)     | `oninput`. The native `onchange` fires when the value is committed.                        |
| `className`                               | `className` on HTML elements, as in React; SVG elements use `class`                        |
| `style={{ left: 10 }}`                    | `style={{ left: '10px' }}`: values are strings with units, or a reactive string            |
| `ref`                                     | the same prop, but it is set when the element is constructed, not when it is mounted       |

## Events

Like Preact, DOM event handlers use the standard names and semantics. Instead of `onClick`, use `onclick`. The `onchange` event is the standard HTML change event and not an alias for `oninput` as in React. The handler's `event.target` is typed as the element, so no cast is needed.

## State

Instead of `useState` you use `reactive`. A reactive value can come from anywhere: you do not have to create it inside a component, and passing it to another component costs nothing.

```tsx live title="State"
import { reactive } from 'pipis';

export default function App() {
  const count = reactive(0);
  return (
    <div>
      <button onclick={() => (count.value = count.value + 1)}>Add</button>
      <div>{count}</div>
    </div>
  );
}
```

## Effects

Instead of `useEffect` you use `Watch` to react to changes in a reactive value, or `Effect` to run something when a component is mounted and clean it up when it is unmounted.

```tsx live title="Watch and Effect"
import { Effect, Watch, reactive } from 'pipis';

export default function App() {
  const count = reactive(0);
  return (
    <>
      <Effect>
        {() => {
          console.log('Mounted');
          return () => console.log('Unmounted');
        }}
      </Effect>
      <Watch value={count}>
        {(newValue) => {
          console.log('Count changed:', newValue);
        }}
      </Watch>
      <button onclick={() => (count.value = count.value + 1)}>Count: {count}</button>
    </>
  );
}
```

## Derived values

Instead of `useMemo` you use `select`. If the source values are all static, simply compute the value in the function body.

```tsx live title="Derived values compared"
import { reactive, select } from 'pipis';

export default function App() {
  const count = reactive(0);
  const doubleCount = select(count, (value) => value * 2);
  return (
    <div>
      <button onclick={() => (count.value = count.value + 1)}>Add</button>
      <div>Count: {count}</div>
      <div>Double count: {doubleCount}</div>
    </div>
  );
}
```

## Context

Instead of `createContext` and `useContext`, use `defineContext`, which gives a provider and a consumer. The value is resolved when the component is constructed, so pass a reactive value as the context if it must change. See [Utilities](utilities.md#context).

## References

To get a DOM node, use the `ref` prop. It is a function that receives the element, or an object with a `value` property that is set to it (a reactive value works). DOM nodes are persistent, so the reference is set once, when the element is constructed, and never cleared; it is set before the parent is ever mounted. As in React, `ref` has no special handling in your own components.

```tsx check title="A ref"
export function App() {
  let box: HTMLElement | undefined;
  return <div ref={(el) => (box = el)} onclick={() => box?.classList.toggle('on')} />;
}
```

> **Note.** The node a `ref` gives you is not in the document yet, so calling `.focus()` in it does nothing. Capture the node and use it in an `Effect` ([Patterns and pitfalls](patterns-and-pitfalls.md#ref-fires-at-construction-not-at-mount)).
