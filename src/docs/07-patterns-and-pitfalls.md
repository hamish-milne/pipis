## Patterns and pitfalls

A collection of non-obvious details worth knowing, uncovered while building the example apps.

### `ref` fires at construction, not at mount

`ref` callbacks run while the element is being _constructed_ (as part of `createElement`), before the returned mount function is ever called with a real parent. At that point the node exists, but is very likely still detached from the document - calling something like `.focus()` synchronously inside a `ref` callback is a no-op, since browsers ignore focus calls on detached nodes.

The idiomatic fix is to capture the node into a local variable with `ref`, then perform the action explicitly with an `Effect` - this makes it clear _when_ the action happens, and the reactive value is free to be read anywhere else too:

```tsx
function App() {
  let inputBox!: HTMLInputElement;
  return (
    <>
      <Effect>{() => inputBox.focus()}</Watch>
      <input ref={(el) => (inputBox = el)} />
    </>
  );
}
```

An imperative `ref` is still the right tool when you need to do setup that doesn't require the node to be live, such as attaching an event listener directly to the DOM node.

### Children are mounted in reverse order

Due to how the sibling node passed to an Element on mount is the _next_, or right-hand sibling (which is itself derived from the semantics of `insertBefore()`), children of built-in Elements are mounted in reverse order: first the parent node, then the right-most child, moving leftward. This mainly matters when using `Watch` and `Effect` in that any side-effects trigger in reverse order, and in particular any prior siblings of `Effect` won't be attached to the Document before the function is called.

The upshot is that `Effect`, if used, should always be the **first child** of the root Element, guaranteeing all the other nodes will be active before the side-effect is invoked.

## `dynamic()`'s marker is a `Comment`, and that's compatible with CSS

Utilities like `If`, `OneOf`, `List`, `Repeat`, and `Dynamic` are all built on a shared `dynamic()` helper, which inserts a persistent `Comment` node as a stable anchor ("head") before any of their real content. CSS structural pseudo-classes like `:empty` and `:only-child` ignore comment nodes per spec, so patterns like `<ul className="empty:hidden">...</ul>` still work correctly even when the list's actual items are wrapped in one of these utilities.
