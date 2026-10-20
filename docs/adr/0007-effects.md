---
tags: [effects, lifecycle]
---
# 7. An `Effect` runs on mount, cleans up on unmount, and goes first

**Decision.** `effect(fn)` runs `fn` when it is mounted and its returned cleanup when it is unmounted. An effect that returns no cleanup
still counts as run, so it does not run again when the same element is mounted again at the same place (a `List` does that on every
update). It is placed as the first child of its parent: children mount right to left, so the siblings after it are already attached
when it runs. On a server, where there is no screen for it to attach to, an effect is not run ([ADR 19](0019-server-rendering.md)).

**Why.** Side effects (listeners, timers, animation loops) need a defined start and end that follow the element's life, not the
component body, which runs once and has no end.

**Evidence** (`dynamic.test.ts`, "effect and Effect").

- Runs on mount, not before; runs once however often it is mounted at the same place; runs again after a remount.
- As the first child it sees its later siblings attached; as the last child it does not (`LLM.md` mistake 6).
- Its cleanup runs when the element it is inside is unmounted, and when a `List` row, an `If` or a `OneOf` child is removed.
- An effect with no cleanup is not re-run when the list holding it updates.
- An error it throws goes to the error handler (ADR 12).

**Consequences.** The first-child rule is a convention the types cannot check.
