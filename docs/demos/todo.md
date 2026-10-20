# Todo list

A classic todo list. It holds the todos in one `reactive` array, uses [`select`](../reference/api.md#select) to derive the fields of each row (so a row updates only when its own data changes, not when another item does), and [`List`](../reference/api.md#list) for keyed, reorderable rows.

```demo
todo
```
