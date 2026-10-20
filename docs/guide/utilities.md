# Utilities

The elements and functions for the things an app needs beyond state and structure: running code when something mounts or changes, loading data, rendering somewhere else in the document, handling errors, and passing a value down the tree.

## Effects

`Effect` runs a function when it is mounted and the function it returns when it is unmounted. It is the place for anything that needs to be undone: a listener, a timer, an animation loop. It renders nothing. An effect is for the browser: when a component is rendered on a server it is not run ([Server rendering](server-rendering.md)).

```tsx live title="Effect"
import { Effect, reactive } from 'pipis';

export default function Clock() {
  const seconds = reactive(0);
  return (
    <div>
      {/* The first child, so the siblings after it are in the document when it runs */}
      <Effect>
        {() => {
          const timer = setInterval(() => (seconds.value = seconds.value + 1), 1000);
          return () => clearInterval(timer);
        }}
      </Effect>
      <p>{seconds} seconds</p>
    </div>
  );
}
```

Put an `Effect` as the **first child** of its parent. Children are mounted right to left, so the siblings after it are already in the document when it runs, which matters if it uses their nodes ([Patterns and pitfalls](patterns-and-pitfalls.md#children-are-mounted-in-reverse-order)). It runs on mount only, not when state changes, and runs again if the element is mounted again after being unmounted.

`Watch` runs a function with the current value of a reactive value when it is mounted, and again on every change:

```tsx live title="Watch"
import { Watch, reactive } from 'pipis';

export default function Title() {
  const text = reactive('Hello');
  return (
    <div>
      <Watch value={text}>
        {(newValue) => {
          document.title = newValue;
        }}
      </Watch>
      <input value={text} oninput={(e) => (text.value = e.target.value)} />
    </div>
  );
}
```

## Suspense

`Suspense` handles the loading, loaded and failed states of asynchronous data. Pass a function to `promise` to fetch once on mount, or a reactive promise to fetch again whenever you assign a new one. While the promise is pending it shows `loading`; when it resolves the child, a function of the data, is shown; if it rejects, `error` is shown. On a server a `Suspense` shows `loading` and does not start the promise.

```tsx live title="Suspense"
import { Suspense } from 'pipis';

// A promise that settles after a moment, in place of a request
const load = () => new Promise<string>((resolve) => setTimeout(() => resolve('The data has arrived'), 300));

export default function App() {
  return (
    <Suspense
      promise={load}
      emptyData=""
      loading={<p>Loading...</p>}
      error={(err) => <p>Failed: {String(err.value)}</p>}
    >
      {(data) => <p>{data}</p>}
    </Suspense>
  );
}
```

`emptyData` is an empty value of the data's type (`''`, `[]`, `{ name: '' }`): the child and `error` always receive a fully populated reactive value, so they never need a null check. If `loading` or `error` is left out, the child is shown in that state with `emptyData`.

When `promise` is a reactive and is assigned again, the latest promise wins: one that has been replaced is ignored however and whenever it settles, so a slow request cannot overwrite a newer one ([ADR 14](../adr/0014-suspense.md)).

## Portals

`Portal` renders its children into a different place in the document, marked by a `PortalTarget`. The target records its position in a reactive value, which you pass to the portal. The position is a pair of live node references, so it keeps working if the target is moved, for example by a reordering `List`. A portal is rendered by an effect, so it is not rendered on a server.

```tsx live title="Portal"
import { Portal, PortalTarget, reactive, type PortalTargetValue } from 'pipis';

export default function App() {
  const target = reactive<PortalTargetValue>(undefined);
  return (
    <div>
      <p>The portal's content appears below, wherever the target is:</p>
      <aside>
        <PortalTarget ref={target} />
      </aside>
      <Portal target={target}>
        <p>This is rendered in the portal target</p>
      </Portal>
    </div>
  );
}
```

Several portals can share one target. Each inserts its content before the target's position, so they appear in the order they were mounted.

## The document head

`Helmet` renders its children into `document.head`, before what is already there, and removes them when it is unmounted. Use it for a title, a `meta` tag or a stylesheet that belongs to a part of the app. On a server it renders into the `head` that `renderToString` returns:

```tsx live title="Helmet"
import { Helmet } from 'pipis';

export default function Page() {
  return (
    <div>
      <Helmet>
        <title>Settings</title>
        <meta name="description" content="Your settings" />
      </Helmet>
      <h1>Settings</h1>
    </div>
  );
}
```

## Error boundary

`ErrorBoundary` catches errors in what is under it and shows a fallback instead. The fallback is a function that is given the error as a reactive value.

```tsx live title="ErrorBoundary"
import { ErrorBoundary, Watch, reactive, select } from 'pipis';

function Counter() {
  const count = reactive(0);
  return (
    <div>
      <button onclick={() => (count.value = count.value + 1)}>Count: {count}</button>
      <Watch value={count}>
        {(n) => {
          if (n === 3) throw new Error('The count reached 3');
        }}
      </Watch>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={(err) => <p>Something went wrong: {select(err, (e) => (e instanceof Error ? e.message : String(e)))}</p>}>
      <Counter />
    </ErrorBoundary>
  );
}
```

The third click throws from the `Watch`, on a state change long after everything was mounted, and the boundary replaces the counter with the fallback.

> **Note.** A boundary catches errors from what runs once its children are **mounted** and later. An error thrown while a component function is _constructed_ happens in the code that calls it, before any boundary exists, so use an ordinary `try`/`catch` there.

It catches errors anywhere under it, at any depth: a child that throws as it mounts, and a function that throws on a later change (a `select` function, a `Watch` or `Effect` body, or a function you give to `List`, `OneOf`, `If` or `Dynamic`). The nearest boundary wins, and an error thrown by the fallback itself goes to the boundary outside it, or to the global error handler (`console.error`) if there is none ([ADR 12](../adr/0012-error-handling.md)).

Errors in event handlers, timers and promise callbacks are not caught, because they run outside any mount or subscription. Whether they are recoverable depends on the app; the global `error` event is how to find out that one happened:

```tsx check title="Reacting to an uncaught error"
import { OneOf, reactive } from 'pipis';

export function App() {
  const appState = reactive<'ok' | 'error'>('ok');
  window.addEventListener('error', () => (appState.value = 'error'));
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

## Context

`defineContext` makes a provider and a consumer for passing a value down the tree without threading it through every component's props. The consumer returns the value of the nearest enclosing provider **at the time the component is constructed**, so pass a reactive value as the context if it must change.

```tsx live title="Context"
import { defineContext, reactive, select, type ReactiveState } from 'pipis';

const [withTheme, getTheme] = defineContext<ReactiveState<'light' | 'dark'>>(reactive('light'));

function ThemedButton() {
  const theme = getTheme();
  return (
    <button className={theme} onclick={() => (theme.value = theme.value === 'light' ? 'dark' : 'light')}>
      Theme: {select(theme, (t) => t)}
    </button>
  );
}

export default function App() {
  return withTheme(reactive('dark'), () => (
    <div>
      <ThemedButton />
    </div>
  ));
}
```

The provider runs a function with the value in place, so it applies to what that function constructs, and not to anything made later (an event handler, or a callback after an `await`).
