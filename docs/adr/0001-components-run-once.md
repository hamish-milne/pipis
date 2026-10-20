---
tags: [components, reactivity, performance]
---
# 1. A component runs once

**Decision.** A component function runs when it is created and never again. It returns an element (a function that mounts and
unmounts content). State is shown by passing the reactive value itself into JSX, which subscribes the one DOM node that displays it.
There is no re-rendering, no virtual DOM and no hooks.

**Why.** It removes the whole class of stale-closure and dependency-array mistakes, and makes an update cost proportional to what
changed, not to the size of the component.

**Evidence.**

- `assumptions.test.ts`, "ADR 1": a component body ran once after five state changes, and a change to one value produced exactly one
  DOM mutation (the text node that shows it).
- `bench`: writing a reactive value bound to a text node takes about 150 ns, against about 119 ns for writing the text node directly.

**Consequences.** Anything computed from state has to be a `select`, and structure that changes (show or hide, switch, lists) has to
use `If`, `OneOf` and `List`. Reading `.value` while building JSX compiles and silently never updates, which is why `LLM.md` warns
about it first (mistake 1). `src/types/llm.check.tsx` cannot catch it, because it is valid TypeScript.
