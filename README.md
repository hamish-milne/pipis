# pipis

_pipis_ is a tiny front-end framework for building UIs in JSX — under 1KB, no virtual DOM, no build magic. Write components like you would in React, but state updates go straight to the DOM node that needs them, nothing else re-runs.

## Why?

- **Fast by default.** No vDOM, no diffing, no memoization to think about. Only the DOM nodes bound to changed state ever update.
- **Under 1KB.** Or if you import absolutely everything, under 2KB gzipped. Your app's code is the bundle.
- **No hooks, no re-renders.** Components run once and return a function that mounts and unmounts them. No dependency arrays, no stale closures, no rules of hooks.
- **Just functions.** An element is a function that inserts its content into the DOM: call it with a parent node to mount, call it with nothing to unmount. Stack traces look normal. Nothing is hidden from you.
- **Bring your own state.** Use the built-in `reactive` helper, or wire up Zustand, RxJS, or anything else with a `subscribe` method.

## Getting Started

```tsx
// Write components in JSX, static by default:
function MyComponent() {
  return <div>Hello, world!</div>;
}

// Add simple reactive state inline:
import { reactive } from "pipis";
function Counter() {
  const count = reactive(0);
  return (
    <div>
      <button onClick={() => count.value--}>-</button>
      {/* Reactive values can be used as attributes or content */}
      <span>{count}</span>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
}

// Pass anything you like as a prop:
import type { Reactive, ReactiveState } from "pipis";
function TextInput(props: { entry: ReactiveState<string> }) {
  return <input value={props.entry} onchange={(e) => (props.entry.value = e.target.value)} />;
}
function Greeting(props: { name: Reactive<string> }) {
  return <p>Hello, {props.name}!</p>;
}
function App() {
  // There's no performance cost to hoisting reactive state out of the component.
  const text = reactive("");
  return (
    <div>
      <TextInput entry={text} />
      <Greeting name={text} />
    </div>
  );
}

// Mount the app to the DOM
App()(document.body);
```

## How it works

JSX works by transforming HTML-like syntax (`<foo bar={baz} />`) into function calls (`jsx("foo", { bar: baz })`). The first argument is either a string representing an HTML tag (if lowercase), or a function representing a custom component (if uppercase).

The result of a JSX expression is a 'JSX Element', which can be anything you like. In _pipis_, it's a function with the signature `(parent?: Node, sibling?: Node | null, shadow?: true) => Node | null`. This function is responsible for rendering the element into the DOM when a parent is provided, and cleaning it up when called without a parent.

For 'intrinsic' elements, a.k.a. HTML tags, _pipis_ creates and persists the corresponding DOM nodes and, on mount, binds any reactive values to the appropriate attributes or content. When the element is unmounted, the bindings are removed, allowing the GC to do its thing.

For custom components, that is any function accepting a 'props' object and returning a JSX Element, we simply call the component function with the provided props. The expression `<Foo />` is identical to `Foo({})`, and you can use them interchangeably.

A fragment (`<>...</>`), representing a collection of child nodes without a wrapping DOM node, is simply an ordinary component called `Fragment` with a custom mount behavior that renders its children into the parent. You can even call it directly if you want.

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

The `select` function allows you to create a derived reactive value based on an existing source value. You can either provide a function to compute the derived value, or a key to select a specific property from the input object.

```ts
const state = reactive({ count: 0 });
state.value = { count: 1 };

const count1 = select(state, (s) => s.count);
const count2 = select(state, "count");
```

When you pass a reactive value as an attribute or child of an intrinsic element (a DOM node), _pipis_ will automatically subscribe to changes and update the DOM accordingly.

In custom components, reactive values have no special handling - the props array is passed unmodified to the component function. There is no concept of 're-rendering'; instead, the reactive value is passed all the way down to the leaf components that actually use it. When a change is detected, only the parts of the DOM that depend on the reactive value are updated.

When defining a prop, consider if you want the allowed value to be static (`T`), reactive (`Reactive<T>`), or either (`T | Reactive<T>`). You can check if a value is reactive at runtime with the `isReactive` function. A rule of thumb is to accept both if you're passing a value down the tree without inspecting it, otherwise defaulting to static unless you know the value can change dynamically.

You can create custom reactive values by implementing the `Reactive<T>` interface, which allows binding values to an existing state management framework. For example, the Store object from `zustand/vanilla` already has a `subscribe` function, so all we need to do is set the `[REACTIVE]` property to `true`:

```tsx
import { createStore } from "zustand/vanilla";
import { REACTIVE, select } from "pipis";

const store = createStore((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

const reactiveStore = Object.assign(store, { [REACTIVE]: true });

function App() {
  return (
    <div>
      <p>Count: {select(reactiveStore, (s) => s.count)}</p>
      <button onclick={store.increment}>Increment</button>
    </div>
  );
}
```

## Dynamic UI

Most apps don't use a fully dynamic layout - that is, creating elements of an unknown structure and quantity at runtime. Instead, they have a mostly static structure with dynamic content. _pipis_ is optimized for this common case, allowing you to efficiently update only the parts of the DOM that depend on reactive state.

You can use normal JavaScript branches and loops in your components to render different content based on props or any other variables, but remember that component functions are only called once; simple branches like these are 'static' and don't allow the dynamic addition or removal of elements once the component has been constructed:

```tsx
// The `text` prop is reactive, while the `big` prop is static.
function Header(props: { text: Reactive<string>; big: boolean }) {
  return props.big ? <h1>{props.text}</h1> : <h2>{props.text}</h2>;
}
```

Where the layout of a component does change, it usually fits into one of these common patterns:

1. Conditional rendering, where parts of the UI are added or removed (such as a tabbed interface)
2. List rendering, where a variable number of items is rendered in sequence
3. Reorderable content (such as a sortable list, or a panel layout)

For conditional rendering, you may not need any dynamic layout behaviour at all: consider instead using CSS and `data-*` attributes to show or hide elements with an ordinary binding. A modern browser can efficiently skip over elements with `display: none`, and this may even be more performant as it keeps the DOM structure intact.

```tsx
function App() {
  const isVisible = reactive(true);
  return (
    {/* This example uses Tailwind, but the same effect is achievable with plain CSS */}
    <p className="hidden data-visible:visible" data-visible={isVisible}>
      This paragraph is conditionally visible.
    </p>
  );
}
```

However you can also use the `OneOf` utility to actually mount and unmount elements based on a state value:

```tsx
function App() {
  const tab = reactive("home");
  return (
    <OneOf selector={tab}>
      {{
        home: <div>Home content</div>,
        profile: <div>Profile content</div>,
      }}
    </OneOf>
  );
}
```

For lists, you can use `List` to render items from an array, with a 'key' function to allow re-ordering:

```tsx
function App() {
  const items = reactive(["Item 1", "Item 2", "Item 3"]);
  return (
    <List items={items} key={(item) => item}>
      {(item) => <div>{item}</div>}
    </List>
  );
}
```

Where all else fails, you can use `Dynamic` to render any content derived from any reactive value. Note that this will completely throw away and recreate the DOM nodes whenever the state changes which, naturally, is bad for performance. Consider carefully if one of the more structured patterns above could be used instead.

```tsx
function App() {
  const content = reactive("Initial content");
  return <Dynamic content={content}>{(value) => <div>{value}</div>}</Dynamic>;
}
```

The times where you need to efficiently render a lot of dynamic content are quite rare and specialised (think a text editor or real-time game). For those cases, you can always implement your own render function that directly manipulates the DOM.

```tsx
// Consider a simple text editor where a controller gathers events and forwards them to the view.
// Instead of re-calculating the entire document with every keystroke, we can listen to these events
// and update the DOM incrementally.
function TextEditor() {
  return (parent?: Element) => {
    if (!parent) return;
    parent.onmessage = (event) => {
      switch (event.data.type) {
        case "insert":
          // Add a Text node at the specified position
          break;
        case "delete":
          // Delete the node at the specified position
          break;
      }
    };
  };
}
```

## Comparison with React

Like Preact, DOM event handlers in _pipis_ use the standard names and semantics. So instead of `onClick`, use `onclick`. The `onchange` event is the standard HTML change event instead of an alias for `oninput` like in React.

Instead of _useState_, you use `reactive` to create reactive state variables. Reactive values can come from anywhere; you don't have to define them inside a component.

```tsx
function App() {
  const count = reactive(0);
  return <div>{count}</div>;
}
```

Instead of _useEffect_, you use `Watch` to react to changes in reactive values; or `Effect` to run a side effect when a component is mounted.

```tsx
function App() {
  const count = reactive(0);

  return (
    <>
      <Watch value={count}>
        {(newValue) => {
          console.log("Count changed:", newValue);
        }}
      </Watch>
      <Effect>
        {() => {
          console.log("Component mounted");
          return () => {
            console.log("Component unmounted");
          };
        }}
      </Effect>
    </>
  );
}
```

Instead of _useMemo_, you can use `select` to create derived reactive values. Alternatively, if the source values are all static, you can simply compute the value in the function body.

```tsx
function App() {
  const count = reactive(0);
  const doubleCount = select(count, (value) => value * 2);

  return (
    <div>
      <div>Count: {count}</div>
      <div>Double Count: {doubleCount}</div>
    </div>
  );
}
```

Instead of _createContext_ and _useContext_, use `defineContext` to create a context provider and consumer. Context values are resolved when the element is constructed. You can pass a `Reactive<T>` as the context value if needed.

```tsx
const [withTheme, getTheme] = defineContext(reactive("light"));

function ThemedButton() {
  return <button className={getTheme()}>Themed Button</button>;
}

function App() {
  return withTheme("dark", () => (
    <div>
      <ThemedButton />
    </div>
  ));
}
```

_useCallback_ can usually be omitted entirely: there's no need to memoize functions for performance reasons as in React.

To get a reference to a DOM node, you can use the `ref` prop. The `ref` can be either a function that receives the element or an object with a `value` property that will be set to the element (such as a reactive value). Since DOM nodes are persistent, the reference will be set once when the element is constructed and never cleared, and it is guaranteed to be set before the parent element is ever mounted. Just like in React, there is no special handling for `ref` in custom components.

```tsx
function App() {
  const divRef = reactive<HTMLElement | null>(null);

  return <div ref={divRef}>Hello, world!</div>;
}
```

## Other utilities

### Suspense

The `Suspense` component allows you to declaratively handle loading, success, and error states for asynchronous data.

```tsx
function App() {
  return (
    <Suspense
      promise={fetch("https://api.example.com/data").then((res) => res.text())}
      placeholder=""
      success={(value) => <div>Data: {value}</div>}
      error={(err) => <div>Error: {String(err)}</div>}
    >
      <div>Loading...</div>
    </Suspense>
  );
}
```

### Portal

The `Portal` utility allows you to render a component's children into a different part of the DOM tree, specified by a target element. You can use `PortalTarget` to define the target element and `Portal` to render the children into that target.

```tsx
function App() {
  const portalTarget = reactive<Element>();

  return (
    <>
      <div>
        <PortalTarget ref={portalTarget} />
      </div>
      <Portal target={portalTarget}>
        <p>This will be rendered in the portal target</p>
      </Portal>
    </>
  );
}
```

### Error boundary

The `ErrorBoundary` utility allows you to catch errors in the rendering of its children and display a fallback UI instead. You can provide a reactive error value to the fallback component.

```tsx
function App() {
  return (
    <ErrorBoundary fallback={(err) => <div>Error: {String(err)}</div>}>
      <div>Content that may throw an error</div>
    </ErrorBoundary>
  );
}
```

The `ErrorBoundary` catches errors anywhere under it, at any depth: a child that throws as it mounts, and a callback that throws on a later change (a `select` function, a `Watch` or `Effect` body, or a function you give to `List`, `OneOf`, `If` or `Dynamic`). The nearest boundary wins, and an error thrown by the fallback itself goes to the boundary outside it, or to the global error handler (`console.error`) if there is none. To catch errors at construction time, just use a normal try/catch around the component function.

Errors in event handlers, timers and promise callbacks are not caught by the `ErrorBoundary`, because they run outside any mount or subscription. Depending on the application, these errors may or may not be recoverable. You can use the global error handler to detect if this has occurred and, if necessary, display an appropriate error message or take corrective action.

```tsx
function App() {
  const appState = reactive("ok");
  window.onerror = () => (appState.value = "error");

  return (
    <OneOf selector={appState}>
      {{
        ok: <div>Everything is fine</div>,
        error: <div>An error occurred</div>,
      }}
    </OneOf>
  );
}
```
