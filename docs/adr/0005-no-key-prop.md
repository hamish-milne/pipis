---
tags: [dynamic-ui, react]
---
# 5. There is no `key` prop

**Decision.** Elements have no `key`. A static array rendered with `.map()` needs none, and a list that changes uses `List` with an
`itemKey` function.

**Why.** Keys exist to let a re-rendering framework match old output to new. With no re-rendering there is nothing to match, and
`List` owns identity explicitly.

**Evidence.** `packages/pipis/types/llm.check.tsx`: `<button key={t}>` is a type error. `dynamic.test.ts`, "List": rows are identified by
`itemKey`, built once per key.

**Consequences.** A `key` prop copied from React fails to compile, which is the intent. (A `key` inside an untyped spread of props would
not be caught.)
