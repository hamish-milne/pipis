---
tags: [events, react]
---
# 8. Events use the native lowercase property names

**Decision.** `onclick`, `oninput`, `onsubmit`: the DOM's own property names, assigned as properties. React's `onClick` is not
translated. `onchange` is the native event, which fires when a value is committed; React's `onChange` is `oninput`.

**Why.** No event-name table to ship or keep in step with the DOM, and a handler is exactly the property the DOM already has.

**Evidence.** `core.test.ts`, "events": `onclick` is called with an event whose target is the element; a React-style `onClick` is not
called. `packages/pipis/types/llm.check.tsx`: `onClick` and `onChange` are type errors on `button` and `input`, and `e.target` is typed as the element.

**Consequences.** The enforcement comes from the props being derived from the DOM typings. `HTMLFormElement` is the one DOM element type with
a string index signature (for its named controls), which would let any misspelt prop through, so the intrinsic element types drop index
signatures: `<form onSubmit>` and `<form class>` are type errors like any other element's (`llm.check.tsx`, `formIsCheckedLikeAnyOther`).
