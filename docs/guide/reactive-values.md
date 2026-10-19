# Reactive values

A reactive value is something that holds a value and tells its subscribers when it changes. This page covers the built-in ones, how to derive one from another, and how a reactive value reaches the DOM.

A reactive value is any object that satisfies this interface:

```ts
type Reactive<T> = {
  // A brand to identify reactive values at run time
  readonly [REACTIVE]: true;
  // Calls `callback` with the current value at once, and again on every change. Returns a function that unsubscribes.
  subscribe(callback: (newValue: T) => void): Cleanup;
};
```

## State

`reactive(initial)` makes a value that can be read and written with `.value`. Writing a different value (by `!==`) notifies its subscribers.

```tsx live title="Reading and writing a reactive value"
import { reactive } from 'pipis';

export default function Name() {
  const name = reactive('pipis');
  // `.value` is read and written inside callbacks, never while building the JSX
  return (
    <div>
      <input value={name} oninput={(e) => (name.value = e.target.value)} />
      <p>Hello, {name}!</p>
    </div>
  );
}
```

Notification is synchronous and unbatched: subscribers are called in the order they subscribed, before the assignment returns, so the DOM is already updated when `name.value = ...` has run. Several writes in a row cause several updates; combine related changes into one write.

> **Note.** Writing to a reactive from inside one of its own subscribers is an antipattern. The nested write is delivered at once, ahead of the notification still running, so a subscriber after the writer sees the newer value first and the older one last, and is left showing a stale value ([ADR 6](../adr/0006-synchronous-unbatched-updates.md)).

## Derived values

`select(source, compute)` derives a read-only reactive value from one source, and only notifies when the result changes. Anything computed from state is a `select`: a ternary, a comparison, arithmetic, a template string, including the value of an attribute.

```tsx live title="Derived values"
import { reactive, select } from 'pipis';

export default function Temperature() {
  const celsius = reactive(20);
  const fahrenheit = select(celsius, (c) => c * 1.8 + 32);
  const feels = select(celsius, (c) => (c > 25 ? 'warm' : 'cool'));
  return (
    <div>
      <input type="range" min="0" max="40" value={select(celsius, String)} oninput={(e) => (celsius.value = Number(e.target.value))} />
      <p className={feels}>
        {celsius}°C is {fahrenheit}°F
      </p>
    </div>
  );
}
```

To read one field of an object, pass its key instead of a function: `select(state, 'count')`.

```ts check title="Selecting by key and by function"
import { reactive, select } from 'pipis';

export const state = reactive({ count: 0 });
export const count1 = select(state, (s) => s.count);
export const count2 = select(state, 'count');
```

A few rules follow from how `select` works ([ADR 2](../adr/0002-select.md)):

- It takes exactly two arguments, a function or a key, and one input. There is no multi-input form: keep related state in one reactive object, and select from it.
- It recomputes when its input changes, not when something it reads inside the function changes, so read what you need from the input.
- It is computed once for each subscriber, and is not shared between them.
- A function that throws is reported to the [error handler](utilities.md#error-boundary), and the select keeps its last value.

## Updating objects

State that is an object is updated by assigning a new object, never by changing it in place, because the check for a change is `!==`. `patch` merges a partial value into the current one and assigns the result:

```tsx live title="Patching object state"
import { patch, reactive, select } from 'pipis';

export default function Profile() {
  const user = reactive({ name: 'Ada', address: { city: 'London', country: 'UK' } });
  return (
    <div>
      <button onclick={() => patch(user, { address: { city: 'Paris' } })}>Move to Paris</button>
      <p>
        {select(user, (u) => u.name)} lives in {select(user, (u) => u.address.city)}, {select(user, (u) => u.address.country)}
      </p>
    </div>
  );
}
```

`patch` merges plain objects key by key, to any depth. An array, a `Date`, a `Map` or a class instance in the patch replaces what was there, so to change one element of an array you pass the whole new array. See [Mutable state](non-goals.md#mutable-state) for why in-place changes are not seen.

## Reactive values in the DOM

When you pass a reactive value as an attribute or child of an HTML or SVG element, pipis subscribes to it when the element is mounted, updates exactly that attribute or text node on each change, and unsubscribes when the element is unmounted. A reactive `Content` value (`string | number | false | null | undefined`) renders `false`, `null` and `undefined` as empty text, so `select(obj, 'optionalField')` is safe as a child.

`data-*` attributes take a reactive boolean directly: true sets the attribute, and `null`, `undefined` or `false` removes it. `style` is an object with one entry per CSS property, each a string with units or a reactive string; the object itself is not reactive.

```tsx live title="Reactive attributes and styles"
import { reactive, select } from 'pipis';

export default function Meter() {
  const level = reactive(40);
  return (
    <div>
      <button onclick={() => (level.value = Math.min(100, level.value + 20))}>More</button>
      <div
        data-full={select(level, (l) => l >= 100)}
        style={{ width: select(level, (l) => `${l}%`), height: '12px', background: 'teal' }}
      />
    </div>
  );
}
```

## Reactive props

In your own components, a reactive value has no special handling: the props object is passed to the component function as it is. There is no re-rendering. The reactive value is passed down to the leaf elements that use it, and those are the only things that update.

When you define a prop, decide whether it is static (`T`), reactive (`Reactive<T>`), or either (`MaybeReactive<T>`). Accept either when you pass a value down the tree without inspecting it; otherwise default to static unless the value can change. `isReactive(value)` tells them apart at run time, and `constant(value)` wraps a static value for an API that requires a reactive one.

```tsx live title="A component that takes a reactive prop"
import { constant, reactive, select, type Reactive } from 'pipis';

function Price(props: { amount: Reactive<number> }) {
  // The formatting is done here, so every caller gets it and the value stays reactive
  return <span>{select(props.amount, (n) => n.toFixed(2))}</span>;
}

export default function Cart() {
  const total = reactive(9.5);
  return (
    <p>
      Total <Price amount={total} />, shipping <Price amount={constant(2)} />
    </p>
  );
}
```

## Other libraries

`adapt` turns a store, signal or Observable from another library into a reactive value, without changing it. The [cookbook](cookbook.md) has a recipe for Zustand, Redux, RxJS, Svelte stores, Nanostores, Preact Signals, XState, Valtio and Jotai.
