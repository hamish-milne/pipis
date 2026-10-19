## Other utilities

### Suspense

The `Suspense` component allows you to declaratively handle loading, success, and error states for asynchronous data. Pass a function to `promise` to fetch once on mount, or a `Reactive<Promise<T>>` to (re)fetch whenever you set it yourself, e.g. from a button click.

```tsx
function App() {
  return (
    <Suspense
      promise={() => fetch("https://api.example.com/data").then((res) => res.text())}
      placeholder=""
      success={(value) => <div>Data: {value}</div>}
      error={(err) => <div>Error: {String(err)}</div>}
    >
      <div>Loading...</div>
    </Suspense>
  );
}
```

`placeholder` should be full dummy data of type `T`, not `undefined` - `success` and `error` always receive a fully-populated `ReactiveReadonly<T>`, so you never have to null-check the value they're given. Before the promise settles for the first time, `children` (if given) is shown instead of `success(placeholder)`.

### Portal

The `Portal` utility allows you to render a component's children into a different part of the DOM tree, specified by a target element. You can use `PortalTarget` to define the target element and `Portal` to render the children into that target. Since the captured position is a pair of live node references rather than a snapshot, this keeps working correctly even if the target is later moved (e.g. as part of a reordering `List`).

```tsx
function App() {
  const portalTarget = reactive<PortalTargetValue>();

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

Multiple `Portal`s can target the same `PortalTarget`: each one inserts its content immediately before the target's captured position, so as long as they mount in the order you want them to appear, later ones end up after earlier ones - no extra bookkeeping required.

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

### Markdown

The `Markdown` component (`pipis/markdown`) renders a string of markdown using [marked](https://marked.js.org/) as its parser. Pass a custom `renderer` function to override how any token type is rendered - for example, to add syntax highlighting to code blocks with the `HighlightJS` component (`pipis/highlight`), or styling classes to any other element.

```tsx
import { Markdown, renderToken } from "pipis/markdown";
import { HighlightJS } from "pipis/highlight";

function Docs({ content }: { content: string }) {
  return (
    <Markdown
      content={content}
      renderer={(token) => {
        switch (token.type) {
          case "code":
            return (
              <pre>
                <HighlightJS language={token.lang}>{token.text}</HighlightJS>
              </pre>
            );
          default:
            return renderToken(token); // fall back to the default rendering
        }
      }}
    />
  );
}
```

These are kept as separate entry points (not part of the main `pipis` package) since they pull in `marked` and `highlight.js` - real dependencies with their own size, which most apps that don't render markdown shouldn't have to pay for.
