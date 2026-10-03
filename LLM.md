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

This package (`pipis`) exposes one main entry point (`package.json` `exports`: `.`) plus `pipis/markdown` and `pipis/highlight` — `core.ts`/`reactive.ts`/`dynamic.ts` all come from the single `"pipis"` import, don't guess sub-paths for those.

## Reactive<T>

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

## Reactive API

```ts
reactive<T>(initial: T): ReactiveState<T>  // .value get/set, notifies on strict-!== change only
type ReactiveReadonly<T> = Reactive<T> & { get value(): T }
type ReactiveState<T> = ReactiveReadonly<T> & { set value(T) }
select(input: Reactive<TIn>, compute: (TIn)=>TOut): Reactive<TOut>
select(input: Reactive<TIn>, key: keyof TIn): Reactive<TIn[key]>  // dedupes via !==, prefer this form for plain field reads, reserve callback form for actual computation (formatting/combining/defaulting)
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

`select()` only recomputes when its INPUT reactive changes, not when values read via closure change. `select(itemsForCategory, items => items.find(i => i.key === sel.value.sortKey))` looks fine but goes stale on sort-key change, since `itemsForCategory` only fires when `category` changes — reading `sel.value.sortKey` inside doesn't re-trigger it. Fix: derive from the broadest reactive that actually changes with everything you depend on (here `sel` itself), not a narrower intermediate `select()`.

No `combine()`/`merge()` helper exists for projecting off multiple independent reactives at once. Idiomatic pattern: one reactive object holding all related UI/selection state (e.g. `{category, sortKey, page}`), always replaced wholesale (`sel.value = {...sel.value, sortKey}`), with every derived value projected off that single source via `select()`.

Gating pattern for optional data: rather than `T | undefined` props with null-guards scattered through a component, give the gating component (the one only mounted via `OneOf`/`If` once data is known-good) a module-level `const EMPTY_X: X = {...}` dummy, do `select(maybeUndefinedSource, v => v ?? EMPTY_X)` once, and pass the resulting always-defined `Reactive<X>` down. Reactive `Content` (`string|number|false|null|undefined`) already renders `false`/`null`/`undefined` as empty text, so `select(obj, "optionalField")` is safe to use directly as JSX content without a `?? ""` fallback — only add one if you want a genuinely different displayed value.

## Core API (highlights)

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

`data-*` props accept a `Reactive<boolean>` directly — truthy sets the dataset key, `null`/`undefined`/`false` deletes it. Tailwind's presence variant (`data-foo:text-white`, no brackets) just works off this; bracket form (`data-[foo=bar]:...`) only needed for non-boolean string values.

`disabled={someReactiveBoolean}` works like any other DOM property binding; disabled buttons simply don't fire `onclick`, no extra guard needed in the handler.

A JSX element can't mix a static child with a sibling expression that's an array (e.g. `<div><span/>{items.map(...)}</div>`) — children get bundled into one array, and a nested array isn't a valid `JSXChild` (TS error points at the `.map()` call). Fix by making the whole children list one array expression (`{[staticChild, ...items.flatMap(...)]}`) instead of mixing a literal child with a dynamic one at the same level.

## Dynamic API

```ts
dynamic(mount: MountFn, unmount: Cleanup): JSXElement
  // MountFn = (parent, sibling) => Cleanup|void
  // inserts persistent Comment marker as head before sibling, pre-mount. mount called once per mount (guarded).
List<T>({items: Reactive<readonly T[]>, itemKey: (item,i)=>PropertyKey, children: (item,i)=>JSXElement}): JSXElement
  // keyed reorder/add/remove w/o recreating unaffected items
  // itemKey controls IDENTITY, not freshness: children(item,index) runs once per key and is NOT re-invoked just because the array changed while the key stayed the same.
  // if a row needs to reflect new data under an unchanged key (e.g. fixed filter labels whose counts change), derive its state with select() against the live shared state inside the row — don't rely on the captured `item` arg.
OneOf<T extends PropertyKey>({selector: Reactive<T>, children: Partial<Record<T,JSXElement>>}): JSXElement
  // children is a plain object literal, used as ordinary JSX content: <OneOf selector={sel}>{{a: <X/>, b: <Y/>}}</OneOf> — no need to call OneOf({...}) directly instead of JSX.
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

## Component design tips

Accept raw `Reactive<T>` props (e.g. `price: Reactive<number>`) and do `select()`-based formatting INSIDE reusable display components, rather than taking a pre-formatted `string` prop — keeps reactivity, avoids duplicating formatting at each call site. Callers with a genuinely static value just wrap it with `constant(value)`.

CSS `:empty` ignores empty-string text nodes and comment nodes (not strict "zero child nodes"). Good for `empty:hidden` driven by a single reactive string (fold the label into the string itself, e.g. `` `Limit: ${text}` `` or `""`) — but only works if that string is the element's ONLY child; a nested wrapping `<span>` always counts as a child and defeats it.

## Gotchas summary

1. Dynamic child lists need `List`/`OneOf`/`If`/`Dynamic` explicitly — plain `.map()` in JSX won't update on reactive array change.
2. Never mutate reactive `.value` objects in place; replace whole value.
3. Don't update a reactive value inside its own (or a circularly-dependent) subscriber → infinite loop.
4. `ref` callback timing: construction, not mount — node may be detached.
5. Put `Effect` first among siblings (mount order is reverse).
6. `ErrorBoundary` only catches sync mount errors of direct children, not async/effect errors.
7. `select()` only reacts to its input reactive, not closures read inside `compute` — derive from the broadest reactive that actually changes.
8. No `combine()`/`merge()` — bundle related state into one reactive object, replaced wholesale, and `select()` individual fields off it.
9. `List`'s `itemKey` is identity only; unchanged-key rows don't re-run `children` — derive live-changing row state with `select()` inside the row instead.
10. Object literal as `OneOf`'s `children` is normal JSX, not a reason to drop JSX for a direct function call.
11. `data-*` props take `Reactive<boolean>` directly; no ternary-to-string needed.
12. `disabled={reactiveBoolean}` is a normal binding — disabled buttons just don't fire `onclick`.
13. Can't mix a static JSX child with a sibling `.map()` expression (array-in-array) — wrap the whole children list in one array expression instead.

## Worked example: todo list (simplified from src/samples/todo.tsx)

Shows: array state w/ whole-value replacement, `List`+`itemKey`, per-row `select()` so a row only updates on its own data, reactive `data-*` driving CSS, `empty:hidden`.

```tsx
import { reactive, select, List } from "pipis";

type Todo = { id: number; text: string; done: boolean };
let nextId = 0;

function TodoApp() {
  const todos = reactive<readonly Todo[]>([]);
  const draft = reactive("");

  function addTodo() {
    const text = draft.value.trim();
    if (!text) return;
    todos.value = [...todos.value, { id: nextId++, text, done: false }]; // whole-array replace
    draft.value = "";
  }
  function toggleTodo(id: number) {
    todos.value = todos.value.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  // Row derives its own fields by id — only re-fires when THIS todo's data changes.
  function todoRow(id: number) {
    const todo = select(todos, (list) => list.find((t) => t.id === id)!);
    const text = select(todo, "text");
    const done = select(todo, "done");
    return (
      <li>
        <button onclick={() => toggleTodo(id)} data-done={done}>
          ✓
        </button>
        <span data-done={done} className="data-done:line-through">
          {text}
        </span>
      </li>
    );
  }

  const remaining = select(todos, (list) => list.filter((t) => !t.done).length);

  return (
    <div>
      <p>{remaining} left to do</p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          addTodo();
        }}
      >
        <input value={draft} oninput={(e) => (draft.value = e.target.value)} />
        <button type="submit">Add</button>
      </form>
      {/* ul itself toggled via CSS :empty, no If/OneOf needed */}
      <ul className="empty:hidden">
        <List items={todos} itemKey={(todo) => todo.id}>
          {(todo) => todoRow(todo.id)}
        </List>
      </ul>
    </div>
  );
}
```

## Worked example: gallery (simplified from src/samples/gallery.tsx)

Shows: `select()` to derive the active item from an id, `Dynamic` used correctly (coarse-grained: swapping an entire unrelated subtree — a whole example app — not for routine leaf updates).

```tsx
import { reactive, select, Dynamic, type JSXElement } from "pipis";

type Example = { id: string; label: string; component: () => JSXElement };
const examples: Example[] = [
  { id: "todo", label: "Todo", component: TodoApp },
  { id: "weather", label: "Weather", component: WeatherApp },
];

function Gallery() {
  const selected = reactive(examples[0].id);
  const current = select(selected, (id) => examples.find((e) => e.id === id)!);

  return (
    <div>
      <nav>
        {examples.map((example) => {
          const isSelected = select(selected, (id) => id === example.id);
          const tabClass = select(isSelected, (active) => (active ? "active" : ""));
          return (
            <button onclick={() => (selected.value = example.id)} className={tabClass}>
              {example.label}
            </button>
          );
        })}
      </nav>
      {/* Dynamic fully recreates the chosen example's DOM+state on every switch — fine here since switches are rare and the subtrees are unrelated. */}
      <Dynamic value={current}>{(example) => example.component()}</Dynamic>
    </div>
  );
}
```
