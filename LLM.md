# pipis — LLM reference

Tiny JSX UI framework. No vDOM, no re-renders, no hooks. <1KB. Components run ONCE, return a mount/unmount fn. State updates patch DOM directly.

## Core model

Element = `(parent?: Node, sibling?: Node|null) => Node|null`

- call w/ `parent` → mount: insert content before `sibling` (or end if null), return stable "head" node.
- call w/ no `parent` → unmount: remove nodes, cleanup subs, return value unused.
- head = leftmost owned node, OR `sibling` unchanged if renders nothing. Fixed once mounted — if content shape can change, use a `Comment` marker node as head (see `createMarker`/`dynamic`).
- re-mount w/ same parent/sibling = no-op (cheap, idempotent). Different parent/sibling = move.
- Component = fn(props) → Element. `<Foo x={1}/>` ≡ `Foo({x:1})`. Lowercase tag = intrinsic HTML/SVG/MathML, uppercase = component fn.
- Fragment `<>...</>` = component, no wrapper DOM node, collapses to single child if ≤1.
- Children mount in REVERSE order (rightmost first) b/c sibling arg is the next/right node. So `Effect` should be FIRST child of parent element (ensures siblings attached before effect runs).
- Construction (component body) must be idempotent, no side effects/subscriptions. Mount = side effects ok, should be reversible on unmount where practical. Don't mutate app state during mount (except Portal).

## Reactive<T> (core.ts)

```ts
const REACTIVE: symbol // brand
type Reactive<T> = { readonly [REACTIVE]: true; subscribe(cb:(v:T)=>void): Cleanup }
type Cleanup = () => void
type MaybeReactive<T> = Reactive<T> | T
isReactive<T>(value): value is Reactive<T>
subscribe<T>(reactive, cb) // = reactive.subscribe(cb)
```

Custom reactive: implement interface, or `adapt(storeWithSubscribe)` (reactive.ts) sets brand on any obj w/ `.subscribe`. Used for zustand/vanilla stores, RxJS Observables.

Passing `Reactive<T>` as intrinsic attr/child auto-subscribes on mount, unsubscribes on unmount. In custom components props pass through unmodified — no special handling, reactive value flows down to leaf that uses it.

## reactive.ts API

```ts
reactive<T>(initial: T): ReactiveState<T>  // .value get/set, notifies on strict-!== change only
type ReactiveReadonly<T> = Reactive<T> & { get value(): T }
type ReactiveState<T> = ReactiveReadonly<T> & { set value(T) }
select(input: Reactive<TIn>, compute: (TIn)=>TOut): Reactive<TOut>
select(input: Reactive<TIn>, key: keyof TIn): Reactive<TIn[key]>  // dedupes via !==
constant<T>(value): ReactiveReadonly<T>  // static value wrapped as reactive
adapt(objWithSubscribe): obj & {[REACTIVE]:true}
defineContext<T>(defaultValue): [provider, consumer]
  // provider(value, ()=>...): runs inner w/ value pushed; consumer() reads nearest value, resolved at CONSTRUCTION time
withErrorHandler / getErrorHandler: defineContext<ErrorHandler> pair, default console.error
handleError(fn, errReturnVal?): wraps fn, catches sync throw, calls getErrorHandler()(err), returns errReturnVal
subscribeWithCatch(reactive, cb): reactive.subscribe(handleError(cb))
```

Mutable state anti-pattern: never mutate reactive object/array in place — replace whole value (`state.value = {...state.value, a:3}`). In-place edits won't notify (no new ref) and same-value assign is no-op (===).

Update loops: don't update a reactive value from its own subscriber (or transitively from a child's Watch on a value the parent derives from) → stack overflow.

## core.ts API (highlights)

```ts
emptyElement: JSXElement // renders nothing, returns sibling
Fragment({children}): JSXElement
moveNode(element: ChildNode, parent: JSXParent, sibling?): void
textNode(content: Content | Reactive<Content>): JSXElement
createMarker(text?: string): Comment // stable anchor node
createElement<T extends keyof IntrinsicElements>(type: T, props): JSXElement
  // DOM node created once, reused across mount/unmount cycles. Static props set once; Reactive props subscribed on mount/unsubscribed on unmount.
setRef<T>(props: RefProp<T>, value: T)
type RefProp<T> = { ref?: ((instance:T)=>void) | {set value(T|null|undefined)} }
type Content = string|number|false|null|undefined // renders as text node, null/undefined = empty
type ChildrenProp = { children?: JSXChild | readonly JSXChild[] }
type IntrinsicElements = // derived from HTMLElementTagNameMap+SVG+MathML, DOM-standard event names (onclick not onClick), onchange = native change event
```

Event handler prop types auto-narrow `event.target` to the element's type — no casting needed.

`ref` fires at CONSTRUCTION time (before mount, node likely detached from doc) — don't call `.focus()` etc synchronously in ref callback. Capture node in local var via ref, act in `Effect` instead.

## dynamic.ts API

```ts
dynamic(mount: MountFn, unmount: Cleanup): JSXElement
  // MountFn = (parent, sibling) => Cleanup|void
  // inserts persistent Comment marker as head before sibling, pre-mount. mount called once per mount (guarded).
List<T>({items: Reactive<readonly T[]>, itemKey: (item,i)=>PropertyKey, children: (item,i)=>JSXElement}): JSXElement
  // keyed reorder/add/remove w/o recreating unaffected items
OneOf<T extends PropertyKey>({selector: Reactive<T>, children: Partial<Record<T,JSXElement>>}): JSXElement
If({condition: Reactive<boolean>, children}): JSXElement // mounts/unmounts child based on bool
Dynamic<T>({value: Reactive<T>, children: (T)=>JSXElement}): JSXElement
  // full DOM recreate on every change — prefer List/OneOf when possible
effect(fn: () => Cleanup|undefined): JSXElement // runs fn on mount, cleanup on unmount
Effect: (props: {children: ()=>Cleanup|undefined}) => JSXElement // JSX wrapper for effect()
Watch<T>({value: Reactive<T>, children: (T)=>void}): JSXElement // runs on mount + every change
Suspense<T>({promise: (()=>Promise<T>)|Reactive<Promise<T>>, placeholder: T, success:(ReactiveReadonly<T>)=>JSXElement, error?:(ReactiveReadonly<unknown>)=>JSXElement, children?}): JSXElement
  // promise fn = fetch once on mount; Reactive<Promise> = refetch on reassignment. success/error always get fully-populated value (placeholder used before first settle, no null checks needed). children shown pre-settle instead of success(placeholder), if given.
ErrorBoundary({fallback: (ReactiveReadonly<unknown>)=>JSXElement, children}): JSXElement
  // only catches sync throw during mount of DIRECT children. Not state-update/effect errors — use window.onerror + reactive flag for those.
type PortalTargetValue = readonly [Node, Node|null] | undefined
PortalTarget(props: RefProp<PortalTargetValue>): JSXElement // marks position, renders nothing
Portal({target: Reactive<PortalTargetValue>, children}): JSXElement
  // renders children at target's live position; multiple Portals to same target insert in mount order
Helmet(props: ChildrenProp): JSXElement // renders children into document head
```

## Non-pipis-core utilities (separate entry points, pull extra deps)

- `pipis/markdown`: `Markdown({content, renderer?})`, `renderToken(token)` — marked-based, custom renderer fn per token type for syntax highlighting/styling.
- `pipis/highlight`: `HighlightJS({children, language?})` — highlight.js wrapper, use inside Markdown's `code` renderer.

## React comparison cheatsheet

| React                    | pipis                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| useState                 | `reactive(initial)`                                                                      |
| useEffect                | `Effect`/`effect()` (mount/unmount), `Watch` (react to value changes)                    |
| useMemo                  | `select(source, fn)` or just compute inline if static                                    |
| useCallback              | not needed, no re-render cost                                                            |
| createContext/useContext | `defineContext` — resolved at construction time, pass `Reactive<T>` as value for dynamic |
| ref                      | same `ref` prop, but fires at construction not mount (see caveat above)                  |
| onClick                  | `onclick` (native DOM names/semantics throughout)                                        |

## Gotchas summary

1. Dynamic child lists need `List`/`OneOf`/`If`/`Dynamic` explicitly — plain `.map()` in JSX won't update on reactive array change.
2. Never mutate reactive `.value` objects in place; replace whole value.
3. Don't update a reactive value inside its own (or a circularly-dependent) subscriber → infinite loop.
4. `ref` callback timing: construction, not mount — node may be detached.
5. Put `Effect` first among siblings (mount order is reverse).
6. `ErrorBoundary` only catches sync mount errors of direct children, not async/effect errors.
