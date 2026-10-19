# 11. Mounting is idempotent and unmounting leaves nothing behind

**Decision.** An element is a function `(parent?, sibling?)`. Called with a parent it mounts, with nothing it unmounts. Mounting again at
the same place changes nothing; at another place it moves the content. Unmounting removes the nodes, ends every subscription and runs
every cleanup, at any depth. Children mount right to left, each given the node to its right as its sibling.

**Why.** It is the whole contract that `If`, `List`, `OneOf` and `Portal` are built on, and it lets an element be moved without rebuilding.

**Evidence.**

- `assumptions.test.ts`, "ADR 11": 5 seeds of 300 random steps (change a value, unmount, remount at the same or another place, mount
  again at the same place) over a tree that uses every dynamic element. After every step the long-lived tree has the same markup as one
  built fresh from the same state, and while unmounted nothing is subscribed.
- `leaks.test.ts`: for each element type, mounting subscribes, unmounting leaves no subscription and no DOM, and repeated mounting
  subscribes once; and the same with the element inside a `div`.
- `core.test.ts`, `dynamic.test.ts`: no DOM mutation when mounted again at the same place; a move takes the children along.

**Consequences.** Unmounting an element unmounts its children first, so every cleanup runs; a removed row also detaches its children from
itself, which is a few DOM calls on a node that is already out of the document. A dynamic element (`If`, `List`, `OneOf`, `Dynamic`) keeps
a comment node as its fixed head and places it before its sibling when it is first mounted or when the sibling changes.
