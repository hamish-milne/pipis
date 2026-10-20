---
description: Showing, choosing, listing and rebuilding content with If, OneOf, List, ReactiveList and Dynamic.
tags: [dynamic-ui, performance]
---
# Dynamic UI

Most apps do not have a fully dynamic layout, with elements of an unknown structure and quantity made at run time. They have a mostly static structure with dynamic content, and pipis is built for that. This page covers the elements for the cases where the structure itself changes: `If`, `OneOf`, `List`, `ReactiveList` and `Dynamic`.

You can use ordinary JavaScript branches and loops in a component to build different content from its props, but a component runs once, so a branch like this is decided when the component is made and cannot add or remove elements afterwards:

```tsx live title="A static branch"
import { reactive, type Reactive } from 'pipis';

// `text` is reactive, while `big` is static: it is read once, when the component is made
function Header(props: { text: Reactive<string>; big: boolean }) {
  return props.big ? <h1>{props.text}</h1> : <h2>{props.text}</h2>;
}

export default function App() {
  return <Header text={reactive('A heading')} big={false} />;
}
```

Where the layout does change, it usually fits one of three patterns: parts of the UI added or removed (a tabbed interface), a variable number of items in sequence, and content that can be reordered. Each has an element.

## Showing and hiding

You may not need dynamic layout at all. Showing and hiding with CSS and a `data-*` attribute keeps the DOM as it is, which a browser skips over cheaply (this example uses Tailwind, but plain CSS works the same way):

```tsx live title="Hiding with a data attribute"
import { reactive } from 'pipis';

export default function App() {
  const isVisible = reactive(true);
  return (
    <div>
      <button onclick={() => (isVisible.value = !isVisible.value)}>Toggle</button>
      <p className="hidden data-visible:visible" data-visible={isVisible}>
        This paragraph is hidden with CSS.
      </p>
    </div>
  );
}
```

Where you do want content to be mounted and unmounted, use `If` for one condition. Its `condition` must be a reactive boolean: derive one with `select`.

```tsx live title="If"
import { If, reactive } from 'pipis';

export default function App() {
  const isVisible = reactive(true);
  return (
    <div>
      <button onclick={() => (isVisible.value = !isVisible.value)}>Toggle</button>
      <If condition={isVisible}>
        <p>This paragraph is removed from the DOM when hidden.</p>
      </If>
    </div>
  );
}
```

The content of an `If` is built once and mounted and unmounted as the condition changes, so toggling is cheap and its state is kept.

Use `OneOf` to choose between several branches by a key:

```tsx live title="OneOf"
import { OneOf, reactive } from 'pipis';

export default function Tabs() {
  const tab = reactive<'home' | 'profile'>('home');
  return (
    <div>
      <button onclick={() => (tab.value = 'home')}>Home</button>
      <button onclick={() => (tab.value = 'profile')}>Profile</button>
      <OneOf selector={tab}>
        {{
          home: <div>Home content</div>,
          profile: <div>Profile content</div>,
        }}
      </OneOf>
    </div>
  );
}
```

## Lists

`List` renders the items of an array, with an `itemKey` function that identifies each item so rows can be added, removed and reordered without being rebuilt:

```tsx live title="List"
import { List, reactive } from 'pipis';

export default function Shopping() {
  const items = reactive<readonly string[]>(['Apples', 'Bread', 'Cheese']);
  return (
    <div>
      <button onclick={() => (items.value = [...items.value].reverse())}>Reverse</button>
      <ul>
        <List items={items} itemKey={(item) => item}>
          {(item) => <li>{item}</li>}
        </List>
      </ul>
    </div>
  );
}
```

`List` makes each row once, from the plain item, and reuses it, so it suits items that do not change while their key stays the same. `items` must be a reactive value; for a fixed array use `constant(array)`, or just `.map()`.

When rows show data that does change, use `ReactiveList`. Each row is given its item as a reactive value, and only the bindings that depend on what changed run:

```tsx live title="ReactiveList"
import { ReactiveList, reactive, select } from 'pipis';

type Product = { id: number; name: string; quantity: number };

export default function Stock() {
  const products = reactive<readonly Product[]>([
    { id: 1, name: 'Apple', quantity: 1 },
    { id: 2, name: 'Pear', quantity: 4 },
  ]);
  // Change an item by putting a new object for it in a new array
  const add = (id: number) => {
    products.value = products.value.map((p) => (p.id === id ? { ...p, quantity: p.quantity + 1 } : p));
  };
  return (
    <ul>
      <ReactiveList items={products} itemKey={(p) => p.id}>
        {(product) => (
          <li>
            {select(product, 'name')} x {select(product, 'quantity')}
            <button onclick={() => add(product.value.id)}>+</button>
          </li>
        )}
      </ReactiveList>
    </ul>
  );
}
```

Changing one product's quantity updates that row's text and nothing else. It costs one pass over the array however many rows there are: 1.3 ms for one change in a list of 10,000, where giving every row a `select` that searches the array takes 58 ms ([ADR 4](../adr/0004-list-rows.md)). The `index` a row is given is its index when the row was made, and does not follow a later reorder.

> **Note.** A plain `.map()` over reactive state does not update, because the component runs once. Use `List` or `ReactiveList` for any list that changes.

## Rebuilding

Where nothing else fits, `Dynamic` renders any content derived from a reactive value. It throws away and recreates the DOM whenever the value changes, which is slow for anything frequent, so consider whether `If`, `OneOf` or `List` fits first. It is right for swapping a whole unrelated subtree, such as one example app for another.

```tsx live title="Dynamic"
import { Dynamic, reactive } from 'pipis';

export default function App() {
  const content = reactive('Initial content');
  return (
    <div>
      <button onclick={() => (content.value = 'Changed content')}>Change</button>
      <Dynamic value={content}>{(value) => <div>{value}</div>}</Dynamic>
    </div>
  );
}
```

## Doing it yourself

The times when you need to render a lot of changing content efficiently are rare and specialised: a text editor, or a real-time game. For those you can write your own element that works on the DOM directly (see [Custom elements](custom-elements.md)), and use it in JSX like any other component.
