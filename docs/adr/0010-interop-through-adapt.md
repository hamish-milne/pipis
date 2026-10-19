# 10. `adapt` makes a Reactive from another library's store, signal or Observable

**Decision.** A `Reactive<T>` gives its subscriber the current value as soon as it is subscribed to, and `subscribe` returns a cleanup
function. `adapt(source, current?)` returns a **new** Reactive made from another library's source, and does not touch the source:

- `adapt(source)` when its `subscribe` already gives the current value (Svelte stores, Nanostores, Preact Signals, RxJS
  `BehaviorSubject` and `ReplaySubject`). A returned Subscription object (RxJS, XState) is turned into a cleanup function.
- `adapt(source, current)` when it does not (Zustand, Redux, XState): `current` is called for the first value and again on every
  notification, so the arguments the library passes to its listener do not matter.
- `adapt({ subscribe }, current)` when the library's method is different (Valtio, Jotai), with a `subscribe` that calls the callback
  with no arguments.

**Why.** Libraries differ in whether their `subscribe` gives the current value and in what it returns, so a store cannot be used as a
Reactive as it is. Two optional arguments cover the shapes found in the popular ones, and leaving the source untouched means a store can
be adapted by code that does not own it.

**Evidence** (`interop.test.ts`, with the real libraries: Zustand, Redux, XState, RxJS, Svelte, Nanostores, Preact Signals, Valtio, Jotai).
Each gets the same five checks: the current value shows as soon as it is mounted; so does one set before mounting; changes are followed;
nothing is subscribed before mounting or after unmounting (counted on the library's own `subscribe`); and it can be mounted again. Also:
the source is left alone; an Observable with no value yet shows nothing until it emits; both return shapes are accepted.

**Consequences.** `adapt` costs 64 bytes gzipped on top of the counter app. A method that uses `this` (an XState actor's `getSnapshot`) must
be called through a function, as the cookbook shows. The cookbook has a recipe for each library above.
