# Patterns and pitfalls

A collection of non-obvious details worth knowing, found while building the example apps and testing the library.

## `ref` fires at construction, not at mount

`ref` callbacks run while the element is being _constructed_, as part of `createElement`, before the element is ever mounted. At that point the node exists but is almost certainly not in the document, so calling something like `.focus()` in a `ref` callback does nothing: browsers ignore focus on a detached node.

Capture the node into a variable with `ref`, then act on it in an `Effect`. That makes it clear _when_ the action happens:

```tsx live title="Focusing an input on mount"
import { Effect } from 'pipis';

export default function Search() {
  let input: HTMLInputElement | undefined;
  return (
    <div>
      <Effect>
        {() => {
          input?.focus();
          return undefined;
        }}
      </Effect>
      <input ref={(el) => (input = el)} placeholder="Search" />
    </div>
  );
}
```

An imperative `ref` is still the right tool for setup that does not need the node to be in the document, such as adding an event listener to it directly.

## Children are mounted in reverse order

The sibling an element is given on mount is the **next**, right-hand one, which follows from how `insertBefore` works. So the children of an element are mounted in reverse order: first the right-most child, then moving left. This matters for `Effect` and `Watch`: side effects happen in reverse order, and the siblings _before_ an `Effect` are not in the document when it runs.

So an `Effect` should be the **first child** of its parent, which guarantees every other node is in the document before the effect runs.

## The marker node is a comment

`If`, `OneOf`, `List`, `ReactiveList` and `Dynamic` are built on a shared `dynamic()` helper, which keeps a `Comment` node as a fixed anchor before their real content. CSS structural pseudo-classes such as `:empty` and `:only-child` ignore comment nodes, so `<ul className="empty:hidden">` still works when its items come from a `List`.

```tsx live title="Hiding an empty list with CSS"
import { List, reactive } from 'pipis';

export default function Todos() {
  const items = reactive<readonly string[]>([]);
  return (
    <div>
      <button onclick={() => (items.value = [...items.value, `Item ${items.value.length + 1}`])}>Add</button>
      <ul className="empty:hidden">
        <List items={items} itemKey={(item) => item}>
          {(item) => <li>{item}</li>}
        </List>
      </ul>
    </div>
  );
}
```

## Update loops

pipis has no render step that could loop, but it can still loop the way any event system can: one change directly or indirectly causes the same change again, until the stack overflows. The easiest way is to write a reactive value from its own subscriber:

```ts check title="An update loop"
import { reactive } from 'pipis';

const count = reactive(0);
// Each write notifies this subscriber, which writes again: this overflows the stack
export const stop = () => count.subscribe(() => (count.value = count.value + 1));
```

A subtler case is a component that changes a value its own parent derives from:

```tsx check title="A loop through a child"
import { Watch, reactive, select, type Reactive, type ReactiveState } from 'pipis';

// An example of what not to do: this overflows the stack as soon as it is mounted
function BadText(props: { text: Reactive<string>; maxLength: ReactiveState<number> }) {
  return (
    <p>
      <Watch value={props.text}>{(x) => (props.maxLength.value = Math.max(props.maxLength.value, x.length))}</Watch>
      {props.text}
    </p>
  );
}

export function BadComponent() {
  const maxLength = reactive(0);
  // `text` depends on `maxLength`, and `BadText` writes `maxLength` whenever `text` changes
  return <BadText maxLength={maxLength} text={select(maxLength, (n) => 'foo'.repeat(n))} />;
}
```

## A selected value goes stale if it reads state through a closure

`select` recomputes when its input changes, not when something it reads inside its function changes. This one never sees a change to `sortKey` on its own:

```ts check title="A select that goes stale"
import { reactive, select } from 'pipis';

const sel = reactive({ category: 'a', sortKey: 'name' });
const category = select(sel, 'category');

// Wrong: it reads `sel.value.sortKey` but only re-runs when `category` changes
export const stale = select(category, (c) => `${c}:${sel.value.sortKey}`);

// Right: derive from the whole object, which is what actually changes
export const live = select(sel, (s) => `${s.category}:${s.sortKey}`);
```

## Typed events

The handler you give a DOM event prop is typed with the right `event.target` for the element, so no cast is needed:

```tsx live title="Event target typing"
import { reactive } from 'pipis';

export default function Echo() {
  const entry = reactive('');
  return (
    <div>
      <input oninput={(e) => (entry.value = e.target.value)} placeholder="Type here" />
      <p>You typed: {entry}</p>
    </div>
  );
}
```

A prop that is not a property of the element, such as React's `onClick` or `class`, is a type error, so a misspelt prop is found at compile time and not as a handler that silently never runs.
