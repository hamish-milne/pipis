# Getting started

This page installs pipis, sets up JSX, and builds a small app. It assumes TypeScript and a bundler such as Vite; neither is required by the library itself.

## Install

```bash
npm install pipis
```

pipis has no dependencies. To write JSX, tell the compiler to take its runtime from pipis. In `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "pipis"
  }
}
```

and tell the bundler the same. In Vite (`vite.config.ts`):

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: { jsxImportSource: 'pipis' },
});
```

A single file can use the library's JSX without any configuration by starting with a comment: `/** @jsxImportSource pipis */`.

## A first app

Components are functions that return elements. A component runs once, so state is created in its body and shown by putting the reactive value itself into the JSX, as a child or as an attribute:

```tsx live title="Counter with two buttons"
import { reactive } from 'pipis';

export default function Counter() {
  const count = reactive(0);
  return (
    <div>
      <button onclick={() => count.value--}>-</button>
      {/* Reactive values can be used as attributes or content */}
      <span>{count}</span>
      <button onclick={() => count.value++}>+</button>
    </div>
  );
}
```

State can be passed around as a prop. There is no cost to creating it outside the component that shows it, and the component that shows it is the only thing that updates:

```tsx live title="Sharing state between components"
import { reactive, type Reactive, type ReactiveState } from 'pipis';

function TextInput(props: { entry: ReactiveState<string> }) {
  return <input value={props.entry} oninput={(e) => (props.entry.value = e.target.value)} />;
}

function Greeting(props: { name: Reactive<string> }) {
  return <p>Hello, {props.name}!</p>;
}

export default function App() {
  const text = reactive('world');
  return (
    <div>
      <TextInput entry={text} />
      <Greeting name={text} />
    </div>
  );
}
```

Mount the app by calling it, and calling the element it returns with the node to mount into:

```tsx check title="Mounting an app"
import { reactive } from 'pipis';

function App() {
  const message = reactive('Hello');
  return <p>{message}</p>;
}

App()(document.body);
```

## How it works

JSX turns HTML-like syntax (`<foo bar={baz} />`) into function calls (`jsx('foo', { bar: baz })`). The first argument is a string naming an HTML or SVG tag if it is lowercase, or a component function if it is uppercase. `<Foo />` is the same as `Foo({})`, and you can use them interchangeably.

The result of a JSX expression is an _element_: a function with the signature `(parent?: Node, sibling?: Node | null) => Node | null`. Called with a parent, it mounts its content into it, before `sibling` if there is one; called with nothing, it unmounts. Elements are described fully in [Custom elements](../guide/custom-elements.md).

For an HTML or SVG tag, pipis creates and keeps the DOM node, and on mount binds any reactive values to its attributes and content. When the element is unmounted the bindings are removed, so nothing keeps the node alive.

A component is any function that takes a props object and returns an element, so it is called once with the props it is given. A fragment (`<>...</>`) is the component `Fragment`, which mounts its children into the parent with no wrapping node.

## Next

[Reactive values](../guide/reactive-values.md) explains state in detail, and [Dynamic UI](../guide/dynamic-ui.md) covers content that appears, disappears and changes in number.
