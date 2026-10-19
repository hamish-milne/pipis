## Reactive bindings

A reactive value is any object that satisfies the following interface:

```ts
interface Reactive<T> {
  // A brand to identify reactive values at runtime
  readonly [REACTIVE]: true;
  // Subscribes to changes in the reactive value and returns a cleanup function to unsubscribe.
  subscribe(callback: (newValue: T) => void): Cleanup;
}
```

You can create simple reactive values using the `reactive` function provided by _pipis_. This returns an object with a `value` property that is both readable and writable, and automatically notifies subscribers when it changes.

> NOTE: Notification is synchronous and unbatched: subscribers are called in the order they subscribed, before the assignment returns. So writing to a reactive from inside one of its own subscribers is an antipattern: the nested write is delivered at once, ahead of the notification still running, and a subscriber after the writer sees the newer value first and the older one last, leaving it showing a stale value._

The `select` function allows you to create a derived reactive value based on an existing source value. You can either provide a function to compute the derived value, or a key to select a specific property from the input object.

```ts
const state = reactive({ count: 0 });
state.value = { count: 1 };

const count1 = select(state, (s) => s.count);
const count2 = select(state, "count");
```

When you pass a reactive value as an attribute or child of an intrinsic element (a DOM node), _pipis_ will automatically subscribe to changes and update the DOM accordingly.

In custom components, reactive values have no special handling - the props object is passed unmodified to the component function. There is no concept of 're-rendering'; instead, the reactive value is passed all the way down to the leaf components that actually use it. When a change is detected, only the parts of the DOM that depend on the reactive value are updated.

When defining a prop, consider if you want the allowed value to be static (`T`), reactive (`Reactive<T>`), or either (`T | Reactive<T>`). You can check if a value is reactive at runtime with the `isReactive` function. A rule of thumb is to accept both if you're passing a value down the tree without inspecting it, otherwise defaulting to static unless you know the value can change dynamically.

You can create custom reactive values by implementing the `Reactive<T>` interface, which allows binding values to an existing state management framework. `adapt` turns a store, signal or Observable from another library into a reactive value (see the cookbook for Redux, RxJS, Svelte, Nanostores, Preact Signals, XState and more). If its `subscribe` gives the current value at once and returns a cleanup, pass it alone: `adapt(source)`. If it does not (Zustand, Redux, XState), also pass a function that reads the current value. For example, with Zustand:

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
