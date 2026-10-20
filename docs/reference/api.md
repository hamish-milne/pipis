# API reference

Every export of the package, with its signature and what it does. This page is generated from the library's declarations and doc comments by `node tools/api.ts --out docs/reference/api.md`: do not edit it by hand.

Names are imported from `pipis` unless a section says otherwise.

## State

Reactive values: something that holds a value and tells its subscribers when it changes, and ways to derive one from another.

### `reactive`

Creates a simple, independently-writable `ReactiveState` value.

```ts
function reactive<T>(initialValue: T): ReactiveState<T>;
```

Creates a `ReactiveState` with no value yet, which is `undefined` until it is assigned.

```ts
function reactive<T>(initialValue?: T): ReactiveState<T | undefined>;
```

### `ReactiveState`

A `ReactiveReadonly` value that can also be written to via `.value`, notifying subscribers.

```ts
type ReactiveState<T> = ReactiveReadonly<T> & {
    set value(newValue: T);
};
```

### `ReactiveReadonly`

A `Reactive` value with synchronous, always-up-to-date read access via `.value`.

```ts
type ReactiveReadonly<T> = Reactive<T> & {
    get value(): T;
};
```

### `Reactive`

A value that can be observed for changes. Implement this interface to bind a custom state
management solution (e.g. a store with its own `subscribe` method) into pipis.

```ts
type Reactive<T> = {
    readonly [REACTIVE]: true;
    /** Registers `callback` to be invoked with the current value immediately, and again on every change. */
    subscribe(callback: (newValue: T) => void): Cleanup;
};
```

### `MaybeReactive`

A value that may be reactive or static: what a prop takes when it works the same either way. Check which with `isReactive`.

```ts
type MaybeReactive<T> = Reactive<T> | T;
```

### `Cleanup`

Unsubscribes from a `Reactive` value, or tears down an effect/binding. Safe to call more than once.

```ts
type Cleanup = () => void;
```

### `REACTIVE`

Brand symbol used to identify `Reactive` values at runtime; see `isReactive`.

```ts
const REACTIVE: unique symbol;
```

### `isReactive`

Runtime type guard for `Reactive` values, based on the `REACTIVE` brand.

```ts
const isReactive: <T>(value: unknown) => value is Reactive<T>;
```

### `subscribe`

An alternative to directly calling `subscribe` on a `Reactive` value, purely to optimize bundle size.

```ts
function subscribe<T>(reactive: Reactive<T>, callback: (value: T) => void): Cleanup;
```

### `select`

Derives a read-only reactive value from `input` by applying `compute`, only notifying subscribers when the result actually changes.

```ts
function select<TIn, TOut>(input: Reactive<TIn>, compute: (input: TIn) => TOut): Reactive<TOut>;
```

Derives a read-only reactive value by selecting a single property key out of `input`.

```ts
function select<TIn, TKey extends keyof TIn>(input: Reactive<TIn>, key: TKey): Reactive<TIn[TKey]>;
```

### `constant`

Wraps a static value as a `ReactiveReadonly`, for APIs that require a reactive input.

```ts
const constant: <T>(value: T) => ReactiveReadonly<T>;
```

### `patch`

Updates object state without spreading: merges `partial` into the current value, key by key and to any depth, and assigns the result as
a new object. Only plain objects are merged; an array, a `Date`, a `Map` or a class instance in `partial` replaces what was there.

```ts
function patch<T>(state: ReactiveState<T>, partial: DeepPartial<T>): void;
```

### `DeepPartial`

`T` with every key optional, to any depth: what `patch` accepts. Arrays are not made partial: a patch replaces them whole.

```ts
type DeepPartial<T> = T extends object ? T extends (infer _)[] ? T : {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
```

### `adapt`

Makes a `Reactive` out of a store, signal or Observable from another library, without touching it.

A Reactive gives its subscriber the current value as soon as it is subscribed to, and returns a function that unsubscribes. Where the
library's own `subscribe` already does that (RxJS `BehaviorSubject`, Svelte and Nanostores stores, Preact signals), pass it alone: a
returned Subscription object is turned into a cleanup function. Where it does not give the current value (Zustand, Redux, XState),
also pass a function that reads it, such as `store.getState`: it is called to give the first value, and again on every notification,
so the arguments the library passes to its listener do not matter.

```ts
function adapt<T>(source: {
    subscribe(callback: (value: T) => void): Unsubscribable;
}): Reactive<T>;
```

Like the form above, for a source whose `subscribe` does not give the current value (Zustand, Redux, XState): `current` reads it, and
is called for the first value and again on every notification.

```ts
function adapt<T>(source: {
    subscribe(callback: () => void): Unsubscribable;
}, current: () => T): Reactive<T>;
```

## Elements

What JSX makes, and the pieces for making your own.

### `JSXElement`

The result of a JSX expression: a function that mounts or unmounts a piece of DOM content.

Call with a `parent` to mount: the element must insert its content into `parent`, immediately
before `sibling` (or at the end of `parent` if `sibling` is `null`). It must return a stable
"head" node - the leftmost node of its own content, or `sibling` unchanged if it renders nothing.
This return value is fixed at mount time; elements whose leftmost node can change later (because
their content is added, removed, or reordered dynamically) must return a persistent marker node
instead - see `createMarker` and the `dynamic` helper in `dynamic.ts`.

Call with no `parent` to unmount: the element must remove its own DOM nodes and clean up any
subscriptions or effects. The return value is not meaningful in this mode.

Calling mount again with the same `parent`/`sibling` (or moving to a different one) must be a
cheap, idempotent operation - see `moveNode`.

```ts
type JSXElement = (parent?: JSXParent, sibling?: JSXSibling) => Node | null;
```

### `JSXChild`

What a child of an element can be: an element, text, or a reactive value that is text.

```ts
type JSXChild = JSXElement | Content | Reactive<Content>;
```

### `JSXChildArray`

Children nested to any depth.

```ts
type JSXChildArray = readonly (JSXChild | JSXChildArray)[];
```

### `JSXParent`

The first argument of an element: the node to mount into, or `undefined` to unmount.

```ts
type JSXParent = Node | undefined;
```

### `JSXSibling`

The second argument of an element: the node to mount before, or `null` to mount at the end of the parent.

```ts
type JSXSibling = Node | null;
```

### `Content`

A child that renders as a DOM text node: any other primitive value is stringified, `null`/`undefined` render as empty.

```ts
type Content = string | number | false | null | undefined;
```

### `ChildrenProp`

Props shape accepted by any element that can take JSX children.

```ts
type ChildrenProp = {
    readonly children?: JSXChild | JSXChildArray;
};
```

### `RefProp`

Props shape for the `ref` prop, accepted by every intrinsic element.

```ts
type RefProp<T> = {
    readonly ref?: ((instance: T) => void) | {
        set value(_: T | null | undefined);
    };
};
```

### `CoreIntrinsicElements`

The JSX props type for every built-in HTML/SVG/MathML tag, derived from the DOM lib types.

```ts
type CoreIntrinsicElements = {
    [K in keyof AllElements]: IntrinsicElement<AllElements[K], K>;
};
```

### `createElement`

Renders an intrinsic HTML or SVG element. Static props are set once at construction;
`Reactive` props are subscribed on mount and unsubscribed on unmount. The underlying DOM
node is created once and reused across mount/unmount/remount calls.

The namespace is found by asking for an HTML element first: a tag that HTML does not know is created as SVG. So a tag that is
neither (a typo that got past the types) is an `SVGElement`, not the `HTMLUnknownElement` one would expect, and a MathML tag
is not given the MathML namespace, because every MathML element has the one class and nothing tells it from an unknown tag.

```ts
function createElement<T extends keyof CoreIntrinsicElements>(type: T, props: CoreIntrinsicElements[T]): JSXElement;
```

### `Fragment`

Renders a `<>...</>` fragment: a sequence of children with no wrapping DOM node.
Collapses to the child itself (or `emptyElement`) when there are 0 or 1 children,
so it adds no overhead - and no extra stack frame - for the common case.

Because of these optimizations, Fragments only support a static list of children. If
the structure should be dynamic, use `If`, `OneOf`, `List`, `ReactiveList` or `Dynamic`.

```ts
function Fragment({ children }: ChildrenProp): JSXElement;
```

### `emptyElement`

A `JSXElement` that renders nothing; on mount, returns `sibling` unchanged.

```ts
const emptyElement: JSXElement;
```

### `textNode`

Creates a text node that can reactively update its content if given a reactive value.

```ts
function textNode(content: Content | Reactive<Content>): JSXElement;
```

### `createMarker`

Creates a `Comment` node to use as a stable anchor point in the DOM. Useful for implementing
elements whose content can change shape over time - mount the marker once as the element's
fixed head, and insert/remove/reorder actual content around it as needed.

```ts
const createMarker: (text?: string) => Comment;
```

### `moveNode`

Moves a node to a different position in the DOM, if needed.

```ts
function moveNode(element: ChildNode, parent: JSXParent, sibling?: JSXSibling): boolean;
```

### `setRef`

Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object.

```ts
function setRef<T>(props: RefProp<T>, value: T): void;
```

## Structure

Elements whose content changes shape: showing, choosing, listing and rebuilding.

### `If`

Conditionally renders its child based on a boolean reactive value.

```ts
function If({ condition, ...props }: {
    condition: Reactive<boolean>;
} & ChildrenProp): JSXElement;
```

### `OneOf`

Mounts one of several elements, chosen by `selector`, unmounting the previous choice on change.

```ts
function OneOf<T extends PropertyKey>({ selector, children, }: {
    selector: Reactive<T>;
    children: Partial<Record<T, JSXElement>>;
}): JSXElement;
```

### `List`

Renders items from an array, one row per item, keyed by `itemKey`. A row is made once per key, from the plain item as it was then,
and reused: a later update that has the same key does not change it. So it suits items that do not change while their key stays the
same (add, remove and reorder are what it is for). When a row shows data that does, use `ReactiveList`.

```ts
function List<T>({ items, itemKey, children, }: {
    items: Reactive<readonly T[]>;
    itemKey: (item: T, index: number) => PropertyKey;
    children: (item: T, index: number) => JSXElement;
}): JSXElement;
```

### `ReactiveList`

Like `List`, but each row is given its item as a reactive value, which is updated whenever the item for that key changes (by
`!==`). A row selects from it (`select(item, 'name')`) and only the bindings that depend on what changed run. So the list can be
the array of items itself, with no ids and no search: one change costs one pass over the array, however many rows there are.
The `index` a row is given is its index when it was made, and does not follow later reordering.

```ts
function ReactiveList<T>({ items, itemKey, children, }: {
    items: Reactive<readonly T[]>;
    itemKey: (item: T, index: number) => PropertyKey;
    children: (item: ReactiveReadonly<T>, index: number) => JSXElement;
}): JSXElement;
```

### `Dynamic`

Renders content computed from a reactive value, fully recreating the DOM whenever it changes.
Prefer `OneOf`, `List` or `ReactiveList` where they fit; those update in place
instead of throwing away and rebuilding the DOM on every change.

```ts
function Dynamic<T>({ value, children }: {
    value: Reactive<T>;
    children: (props: T) => JSXElement;
}): JSXElement;
```

### `dynamic`

Builds a `JSXElement` whose content can change shape over time (be added, removed, or
reordered) without breaking the fixed "head" contract that `JSXElement` requires.

A persistent `marker` node is inserted once, immediately before the original
`sibling`, before `mount` ever runs - so it's always the leftmost node of the region, and is
always returned as this element's head, however its content changes later. `mount` is free to
insert/move/remove real content anywhere between the marker and `sibling`.

`mount` is only called once per mount (guarded with `cleanup ??=`), so subscribing inside it is
safe even if the returned element's mount function is invoked again with the same parent.

```ts
function dynamic(mount: MountFn, unmount: Cleanup): JSXElement;
```

## Effects

Running code when an element is mounted and unmounted, or when a value changes.

### `effect`

Renders nothing, but runs `fn` on mount and its returned cleanup (if any) on unmount.

```ts
function effect(fn: () => Cleanup | undefined): JSXElement;
```

### `Effect`

JSX-friendly wrapper around `effect`, for running a side effect on mount/unmount.

```ts
const Effect: (props: {
    children: () => Cleanup | undefined;
}) => JSXElement;
```

### `Watch`

Runs `children` with the current value on mount, and again on every subsequent change.

```ts
function Watch<T>({ value, children }: {
    value: Reactive<T>;
    children: (newValue: T) => void;
}): JSXElement;
```

## Async and errors

Loading data, catching errors, and the context that carries the error handler.

### `Suspense`

Renders `loading` while `promise` is pending, `children(data)` once it
resolves, and `error(error)` if it rejects.

```ts
function Suspense<T>({ promise, emptyData, loading, error, children, }: {
    promise: (() => Promise<T>) | Reactive<Promise<T>>;
    emptyData: T;
    loading?: JSXElement;
    error?: (err: ReactiveReadonly<unknown>) => JSXElement;
    children: (value: ReactiveReadonly<T>) => JSXElement;
}): JSXElement;
```

### `ErrorBoundary`

Catches the errors of everything mounted under it and renders `fallback` instead: a child that throws as it mounts, and a
reactive callback that throws on a later change (a `select` function, a `Watch` or `Effect` body, the functions of a `List`,
`OneOf`, `If` or `Dynamic`). The nearest boundary wins, and an error thrown by the fallback itself goes to the handler outside
this boundary. Not covered: an event handler, a timer, or a promise callback, which run outside any mount or subscription.

It works by providing its error handler while it mounts its children, and every subscription made then remembers that handler
(see `handleError`).

```ts
function ErrorBoundary({ fallback, ...props }: {
    fallback: (err: ReactiveReadonly<unknown>) => JSXElement;
} & ChildrenProp): JSXElement;
```

### `ErrorHandler`

A function that is told about an error that was thrown where nothing could catch it: by a subscriber, an effect, or a child as it mounted.

```ts
type ErrorHandler = (error: unknown) => void;
```

### `withErrorHandler`

Runs `inner` with `handler` as the error handler: every subscription made while it runs reports its errors to `handler`, for as long as
it lives. This is how `ErrorBoundary` works, and the default handler is `console.error`.

```ts
const withErrorHandler: <U>(value: ErrorHandler, inner: () => U) => U;
```

### `getErrorHandler`

The error handler that is current: the nearest one provided by `withErrorHandler`, or `console.error`.

```ts
const getErrorHandler: () => ErrorHandler;
```

### `handleError`

Wraps `fn` so that an error it throws is given to the error handler that is current now (see `withErrorHandler`), and the wrapper
returns `undefined` instead of throwing.

```ts
function handleError<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult, err?: undefined): (...args: TArgs) => TResult | undefined;
```

Like the form above, but the wrapper returns `err` when `fn` throws.

```ts
function handleError<TArgs extends unknown[], TResult, TErr>(fn: (...args: TArgs) => TResult, err: TErr): (...args: TArgs) => TResult | TErr;
```

### `subscribeWithCatch`

Subscribes `callback` to `reactive`, with an error it throws given to the error handler that is current now (see `handleError`)
rather than thrown at whoever wrote to the value. Returns the cleanup. Every subscription the library makes on your behalf works this way.

```ts
function subscribeWithCatch<T>(reactive: Reactive<T>, callback: (newValue: T) => void): () => void;
```

### `defineContext`

Creates a context: a `[provider, consumer]` pair for passing a value down the component tree
without threading it through every level of props. The consumer resolves to the nearest
enclosing provider's value at the time the component is constructed.

```ts
function defineContext<T>(defaultValue: T): readonly [<U>(value: T, inner: () => U) => U, () => T];
```

## Portals and the document head

Rendering somewhere else in the document.

### `PortalTargetValue`

The `[parent, sibling]` mount position captured by a `PortalTarget`, or `undefined` if it isn't mounted.

```ts
type PortalTargetValue = readonly [Node, Node | null] | undefined;
```

### `PortalTarget`

Marks a spot in the tree for a `Portal` to render into. Renders nothing itself; assign
its position (via `ref`) to a reactive value and pass that to a `Portal`'s `target` prop.

```ts
function PortalTarget(props: RefProp<PortalTargetValue>): JSXElement;
```

### `Portal`

Renders `children` into the position captured by a `PortalTarget`, wherever that is in
the DOM. Since the captured position is a pair of live node references rather than a snapshot,
this keeps working correctly even if the target is later moved (e.g. as part of a reordering
`List`).

```ts
function Portal({ target, ...props }: {
    target: Reactive<PortalTargetValue>;
} & ChildrenProp): JSXElement;
```

### `Helmet`

Renders its children into the document head.

```ts
function Helmet(props: ChildrenProp): JSXElement;
```

## Platform and server rendering

What `pipis` runs on. By default it is a browser; a bundler can be told it is a server (the `pipis-server` condition), and then an element can be rendered to HTML. See the [guide to server rendering](../guide/server-rendering.md).

### `IS_CLIENT`

Whether the code runs in a browser. `true` here and `false` in the server's build, a constant either way, so what depends on it is removed from the build that cannot use it.

```ts
const IS_CLIENT: boolean;
```

### `renderToString`

From `pipis/server`.

Renders an element to HTML. It is synchronous: the element is mounted, its markup is read, and it is unmounted, so nothing is left
subscribed, and a state change after it has no effect. Reactive values are shown as they are when it is mounted. `Effect`, `Watch`, `Portal`
and `Suspense`'s promise do not run, and event handlers and `ref`s are not used: they are for a browser.

It throws if `pipis` is the browser's build rather than the server's, which is the bundler's to choose: see the guide to server rendering.

```ts
function renderToString(element: JSXElement): RenderResult;
```

### `RenderResult`

From `pipis/server`.

The result of `renderToString`.

```ts
interface RenderResult {
    /** The markup of the element. */
    html: string;
    /** What `Helmet` rendered, as markup for the document's `<head>`. */
    head: string;
}
```

### `serializeData`

From `pipis/server`.

Data for the browser to read, as text to put inside `<script type="application/json">`. It is JSON with `<`, `>`, `&` and the two line
separators written as escapes, so that the data cannot end the script or begin another tag. A value JSON cannot hold (`undefined`, a function)
is `null`.

```ts
function serializeData(value: unknown): string;
```

## The JSX runtime

Imported by the compiler when `jsxImportSource` is `pipis`, from `pipis/jsx-runtime` and `pipis/jsx-dev-runtime`. An app never writes these.

### `Component`

From `pipis/jsx-runtime`.

What a JSX tag names: a lowercase tag of an HTML or SVG element, or a component, which is a function from its props to an element.

```ts
type Component = keyof CoreIntrinsicElements | ((props: ChildrenProp) => JSXElement);
```

### `JSXKey`

From `pipis/jsx-runtime`.

The type of a JSX `key`, which the compiler passes along. pipis has no `key` prop and ignores it: a changing list uses `List`.

```ts
type JSXKey = string | number | null;
```

### `jsx`

From `pipis/jsx-runtime`.

What the compiler calls for a JSX element: makes the element for a tag, or calls the component with its props.

```ts
const jsx: (type: Component, props: ChildrenProp) => JSXElement;
```

### `jsxs`

From `pipis/jsx-runtime`.

What the compiler calls for an element whose children are all static. The same as `jsx`: pipis does not tell them apart.

```ts
const jsxs: typeof jsx;
```

### `jsxDEV`

From `pipis/jsx-dev-runtime`.

What the compiler calls for a JSX element in development: `jsx`, ignoring the extra arguments the compiler passes.

```ts
const jsxDEV: (type: Component, props: ChildrenProp, ..._unused: unknown[]) => import("./base.ts").JSXElement;
```

### `SourceInfo`

From `pipis/jsx-dev-runtime`.

Where a JSX element is in the source, which the compiler passes to `jsxDEV` in development. pipis does not use it.

```ts
type SourceInfo = {
    fileName: string;
    lineNumber: number;
    columnNumber: number;
};
```
