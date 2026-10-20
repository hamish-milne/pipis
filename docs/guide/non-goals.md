---
description: What pipis does not do, and the trade-offs that follow from how it is built.
tags: [dynamic-ui, performance, ssr]
---
# Caveats and non-goals

What pipis does not do, and the trade-offs that follow from how it is built. If you expect something here to work, it is better to know now.

## Dynamic node reuse

Unlike a virtual DOM framework such as React, pipis does not re-use DOM nodes that belong to a different element than the one that was mounted before. This is not relevant for most apps ([Dynamic UI](dynamic-ui.md)), but the trade-off exists: an app with a frequently changing dynamic structure will perform better in React or Preact unless you cache or update incrementally yourself.

Utilities for the common dynamic patterns are provided (`If`, `OneOf`, `List`, `ReactiveList`), but they must be used explicitly. A plain loop or condition over reactive state is evaluated once:

```tsx live title="A static map does not update"
import { List, reactive, type Reactive } from 'pipis';

function MyList(props: { items: Reactive<readonly string[]> }) {
  // Wrong: this reads the items once, when the component is made, and never updates
  //   return <ul>{props.items.value.map((item) => <li>{item}</li>)}</ul>;

  // Right: List follows the reactive value
  return (
    <ul>
      <List items={props.items} itemKey={(x) => x}>
        {(item) => <li>{item}</li>}
      </List>
    </ul>
  );
}

export default function App() {
  return <MyList items={reactive(['one', 'two'])} />;
}
```

## Mutable state

Like many similar frameworks, pipis works best with immutable state. State that is not a primitive (string, number, boolean) is updated by replacing the whole object or array, not by changing it in place. With the built-in `reactive`, an in-place change does not notify subscribers, and a change is detected with a strict equality check (`!==`), so assigning the same value has no effect.

```ts check title="Updating state immutably"
import { patch, reactive } from 'pipis';

export const state = reactive({ a: 1, b: 2 });

// Wrong: nothing is notified, because the object is the same one
//   state.value.a = 3;
// Also wrong: Object.assign changes its first argument, so it is the same object again
//   state.value = Object.assign(state.value, { a: 3 });

// Right: a new object, by hand or with patch
state.value = { ...state.value, a: 3 };
patch(state, { b: 4 });
```

Many state libraries, and tools such as [immer](https://immerjs.github.io/immer/), make this convenient and safe.

## Things that are not here

- **Batching.** Updates are synchronous: each write updates the DOM before it returns. Combine related changes into one write ([ADR 6](../adr/0006-synchronous-unbatched-updates.md)).
- **A `key` prop.** Identity in a list is the `itemKey` of `List` and `ReactiveList` ([ADR 5](../adr/0005-no-key-prop.md)).
- **MathML.** The types accept MathML tags, but they are created as unknown HTML elements ([ADR 13](../adr/0013-namespaces.md)).
- **Adopting server-rendered markup.** A server renders to HTML ([Server rendering](server-rendering.md)), but the browser mounts its own copy over it: it does not take over the nodes the server wrote.
- **A browser older than ES2015**, and a build step that lowers the library's newer syntax for you ([ADR 16](../adr/0016-platform-floor.md)).
