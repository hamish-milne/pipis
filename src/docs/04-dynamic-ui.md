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
    // This example uses Tailwind, but the same effect is achievable with plain CSS
    <p className="hidden data-visible:visible" data-visible={isVisible}>
      This paragraph is conditionally visible.
    </p>
  );
}
```

Where you do want elements to actually mount and unmount, use `If` for a single condition:

```tsx
function App() {
  const isVisible = reactive(true);
  return (
    <If condition={isVisible}>
      <p>This paragraph is actually removed from the DOM when hidden.</p>
    </If>
  );
}
```

Or `OneOf` to pick between several branches based on a key:

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

For lists, you can use `List` to render items from an array, with a `itemKey` function to allow re-ordering:

```tsx
function App() {
  const items = reactive(["Item 1", "Item 2", "Item 3"]);
  return (
    <List items={items} itemKey={(item) => item}>
      {(item) => <div>{item}</div>}
    </List>
  );
}
```

`List` makes each row once, from the plain item, and reuses it, so it suits items that do not change while their key stays the same. When rows show data that does change, use `ReactiveList`: each row is given its item as a reactive value, and only the bindings that depend on what changed run.

```tsx
type Product = { id: number; name: string; quantity: number };

function App() {
  const products = reactive<readonly Product[]>([{ id: 1, name: "Apple", quantity: 1 }]);
  return (
    <ReactiveList items={products} itemKey={(p) => p.id}>
      {(product) => (
        <div>
          {select(product, "name")} x {select(product, "quantity")}
        </div>
      )}
    </ReactiveList>
  );
}
```

Changing one product's quantity (assign a new array with that product replaced by a new object) updates that row's text and nothing else, and costs one pass over the array however many rows there are.

Where all else fails, you can use `Dynamic` to render any content derived from any reactive value. Note that this will completely throw away and recreate the DOM nodes whenever the state changes which, naturally, is bad for performance. Consider carefully if one of the more structured patterns above could be used instead.

```tsx
function App() {
  const content = reactive("Initial content");
  return <Dynamic value={content}>{(value) => <div>{value}</div>}</Dynamic>;
}
```

The times where you need to efficiently render a lot of dynamic content are quite rare and specialised (think a text editor or real-time game). For those cases, you can always implement your own render function that directly manipulates the DOM.

```tsx
// Consider a simple text editor where a controller gathers events and forwards them to the view.
// Instead of re-calculating the entire document with every keystroke, we can listen to these events
// and update the DOM incrementally.
function TextEditor() {
  return (parent?: Element) => {
    if (!parent) return null;
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
    return null;
  };
}
```
