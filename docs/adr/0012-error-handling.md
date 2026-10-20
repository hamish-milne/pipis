---
tags: [errors]
---
# 12. Errors go to the handler that was current when the subscription was made

**Decision.** `handleError(fn)` captures the error handler that is current when it is called, not when `fn` throws. An `ErrorBoundary`
provides its handler while it mounts its children, so every subscription made then, at any depth, reports to it: a child that throws as
it mounts, and a callback that throws on a later change (a `select` function, a `Watch` or `Effect` body, the functions of `List`, `OneOf`,
`If` and `Dynamic`). The nearest boundary wins. An error thrown by the fallback goes to the handler outside the boundary. Not covered:
event handlers, timers and promise callbacks, which run outside any mount or subscription.

**Why.** Errors from state changes are the common case and an error on mount is the unusual one. JSX builds children before the
component that wraps them runs, so a handler cannot be installed around construction; mounting is the one point the boundary controls.

**Evidence** (`dynamic.test.ts`, "ErrorBoundary"; `reactive.test.ts`, "error handling" and "select compute errors").

- Fallback for a child that throws on mount, at depth, with the earlier children unmounted; the error is passed to the fallback.
- Fallback for a `Watch`, `select`, `Effect` or `List` row function that throws on a later change.
- Nearest boundary wins; the fallback's own error goes outward (to an outer boundary, or to the handler outside).
- An error outside the boundary is not caught by it.
- `handleError` keeps the handler of the scope it was made in.

**Consequences.** The default handler is `console.error`, captured when the module loads, so a later spy on `console.error` does not
see it. `select` wraps its compute function, so a throw there is reported and does not reach whoever wrote to the input.
