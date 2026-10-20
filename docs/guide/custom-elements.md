# Custom elements

Most apps build elements from components and HTML tags. You can also write your own element function, to implement something the built-in ones do not, or to work on the DOM directly. An element made this way is used in JSX like any other. One that creates nodes with `document` is for the browser: a server has no `document` (see [Server rendering](server-rendering.md)).

An element has this signature:

```ts
type JSXElement = (parent?: Node, sibling?: Node | null) => Node | null;
```

Calling an element tells it to add its content to the DOM (with a parent) or remove it (without one). The `parent` and `sibling` arguments mean what they do for the DOM's [`insertBefore`](https://developer.mozilla.org/en-US/docs/Web/API/Node/insertBefore): the content goes into `parent`, before `sibling`, or at the end if `sibling` is `null`. In addition, `sibling`, if there is one, is always a child of `parent`, and `parent` is always in the document before the element is called. If `parent` is `undefined`, the element is being unmounted: it removes its nodes and cleans up whatever it set up.

## The head

An element must return a **stable head reference**: a node that can be passed as the `sibling` of any element mounted before it. This is either:

- A node the element owns, which it added to `parent` on mount and which does not change until the element is unmounted; or
- The `sibling` parameter, if the element has no DOM content. If `sibling` is `null`, the element is at the right-most position.

The space between `sibling` and the returned head belongs to the element, which may add other nodes anywhere in it during or after the mount call. On unmount the return value is always `sibling`, because an unmounted element has no content.

```tsx live title="An element with a node of its own"
import { moveNode, type JSXElement } from 'pipis';

function LineBreak(): JSXElement {
  const node = document.createElement('br');
  // The default of null matters: insertBefore wants a node or null, never undefined
  return (parent, sibling = null) => {
    // moveNode only touches the DOM if the node is not already in place
    moveNode(node, parent, sibling);
    return parent ? node : sibling;
  };
}

export default function App() {
  return (
    <p>
      First line
      <LineBreak />
      Second line
    </p>
  );
}
```

## A head that stays put

If an element's content changes while it is mounted, the head must not change with it. If it returned its left-most child and then removed its children, the elements mounted before it would be left holding a node that is gone. In that case, use a **synthetic head**: a node that is only an anchor. A `Comment` node does the job. It is ignored by anything that looks at elements or text, including CSS, and only shows up if you iterate over child nodes.

`createMarker` makes one, and `dynamic` builds the whole pattern: it puts a marker before the sibling, keeps it there, and calls your `mount` function with `(parent, sibling)` once per mount and your `unmount` function when the element is unmounted. `If`, `OneOf`, `List`, `ReactiveList` and `Dynamic` are all made with it.

```tsx live title="An element built with dynamic"
import { dynamic, reactive, type JSXElement, type Reactive } from 'pipis';

// Shows its text, rewriting a text node in place on each change: nothing is rebuilt
function Shout(props: { text: Reactive<string> }): JSXElement {
  const node = document.createTextNode('');
  return dynamic(
    (parent, sibling) => {
      parent.insertBefore(node, sibling);
      // Returns the cleanup for this mount
      return props.text.subscribe((text) => (node.data = text.toUpperCase()));
    },
    () => node.remove(),
  );
}

export default function App() {
  const text = reactive('hello');
  return (
    <p>
      <input value={text} oninput={(e) => (text.value = e.target.value)} />
      <Shout text={text} />
    </p>
  );
}
```

The `mount` function is called once per mount, so subscribing inside it is safe even if the element is mounted again at the same place.

See [Lifecycle](lifecycle.md) for the whole life of a component and an element.
