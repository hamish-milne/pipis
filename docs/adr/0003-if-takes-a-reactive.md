---
tags: [dynamic-ui, types]
---
# 3. `If` takes a reactive boolean, and anything computed is a `select`

**Decision.** `If` takes a `Reactive<boolean>` and nothing else. A condition made from state is a `select`, and a plain `&&` or ternary
is correct only for a value that never changes after construction.

**Why.** A plain boolean would be read once and never update, which is the most common mistake this design invites (ADR 1). Making the
type strict turns the mistake into a compile error at the place it is made.

**Evidence.** `src/types/llm.check.tsx`: `<If condition={show.value}>` is a type error under `@ts-expect-error`; `If` with a reactive
works, and `select(x, (e) => e !== '')` works as a condition. `dynamic.test.ts`, "If": shows and hides, keeps the same child nodes
across toggles, runs child cleanups. A toggle of a small subtree costs about 0.8 µs.

**Consequences.** In plain JavaScript a boolean passed to `If` throws a `TypeError` when it is mounted (it has no `subscribe`), which
does not say what was wrong. That is accepted: a mistake the compiler already rejects does not also need a runtime check or a better
message, so there is none (and no test of that case). The same principle applies throughout.
