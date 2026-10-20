---
tags: [dynamic-ui, performance]
---
# 4. `List` for items that do not change, `ReactiveList` for rows that do

**Decision.** There are two list elements, built on one internal function that keeps rows keyed by `itemKey`, adds, removes and reorders
them, and calls an optional `update` when it sees a key again.

- `List` makes a row once per key, from the plain item, and reuses it. A later update with the same key does not change the row. It is
  for items that do not change while their key stays the same.
- `ReactiveList` gives each row its item as a `ReactiveReadonly<T>`, updated whenever the item for that key changes (by `!==`). A row
  selects what it shows from it (`select(item, 'name')`), and only the bindings that depend on what changed run. The list is the array of
  items itself.

A row's `index` is its index when it was made. Rows are looked up by key in a `Set` and a `Map`, so an update is one pass over the array.

**Why.** A row that shows changing data needs to hear about the change. The alternative, a `List` over ids in which every row selects its
own data from the whole array by id, makes one change cost about rows × rows steps, because every row searches the array and `select` is
not shared (ADR 2). Giving each row its own reactive item removes the search, and a row whose item is the same object is not touched.

**Evidence.**

- `bench`, one field of one row changed (Chromium 156):

  | Rows   | ids and `select` | `ReactiveList` |
  | ------ | ---------------: | -------------: |
  | 100    |            20 µs |          20 µs |
  | 1,000  |           685 µs |         160 µs |
  | 10,000 |            58 ms |         1.3 ms |

  and at 1,000 rows: create 9.2 ms against 1.7 ms, change every row 1.1 ms against 0.3 ms, append 0.8 against 0.2, remove 0.8 against 0.1.
  Reversing 1,000 rows takes about 1 ms, since rows are moved and not rebuilt.
- `dynamic.test.ts`, "List": a reorder keeps every row node; an append or removal touches only the rows that came or went; a key that
  returns is built again.
- `dynamic.test.ts`, "ReactiveList": a changed item updates in its own row with one DOM mutation and nothing rebuilt or moved; a row
  whose item is the same object runs none of its bindings; reorder keeps the nodes; adds and removes build and unmount only the rows that
  came or went; the index does not follow a reorder; it unmounts, remounts and unsubscribes cleanly; and over 200 random edits it renders
  the same as a `List` built fresh from the same items.
- `assumptions.test.ts`, "ADR 4": a `List` row that reads its item goes stale when the item changes (`LLM.md` mistake 11), and the ids
  pattern updates only the changed row.
- `leaks.test.ts` and the "ADR 11" stress test include both. `packages/pipis/types/llm.check.tsx`: a `ReactiveList` row's item is a Reactive, so
  `product.name` is a type error.

**Consequences.** `List` is 331 bytes gzipped on top of the counter app and `ReactiveList` 355 (the `reactive` per row). Sharing the code
costs `List` a few dozen bytes over a stand-alone version. An item is changed by putting a new object for it in a new array.
