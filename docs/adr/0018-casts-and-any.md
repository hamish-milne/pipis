---
tags: [types, tooling]
---
# 18. Casts and `any` in the library are owned in writing

**Decision.** In a library module, `as` casts are an error (`typescript/consistent-type-assertions` with `assertionStyle: 'never'`) and so is
`any`. Where one is the honest answer, the line opts out with `// oxlint-disable-next-line <rule> -- <reason>`, and an opt-out that is no
longer needed fails the build. There are five casts and one `any`, and each says why it stays:

| Where                           | What                                                                 | Why it stays                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `core.ts`, `isReactive`         | `value as Reactive<T> \| null`                                       | The brand is read off any value; narrowing to read it costs 19 bytes in every app.                                   |
| `core.ts`, `setAttribute`       | `element as unknown as Record<string, unknown>`                      | The key is a prop name, so which property it is depends on the props, and `Element` has no index.                    |
| `core.ts`, `createElement`      | `(element as HTMLElement).style`                                     | `Element` has no `style`; the HTML and SVG elements that props can name it for do.                                   |
| `core.ts`, `PropBag`            | `Record<string, any>`                                                | The props are read by name and their type is the union of every element's props.                                     |
| `reactive.ts`, `adapt`          | `source as { subscribe(callback: typeof listener): Unsubscribable }` | The overloads make the listener the right kind for the source, which TypeScript cannot follow through a union.       |
| `reactive.ts`, `patch`          | `mergeDeep(state.value, partial) as T`                               | The merge only replaces keys that `partial` names, with values of the type those keys have, so the result is a `T`.  |

**Why.** A cast is a claim the compiler cannot check, so each one has to be defensible. The first pass found 14; nine went by typing the
code better (an overload over an implementation that reads props by name, `unknown` through `mergeDeep` and `select`, a recursive walk of nested
children in place of `flat`), and these are what is left. `Reflect.set` and `Reflect.get` were tried in place of the two DOM casts and
rejected: they make the access no safer, they only avoid the lint rule, and `Reflect.set` returns `false` where an assignment would throw.

**Evidence.** `vp lint` with `--deny-warnings --report-unused-disable-directives` is part of `all`, and the rule is on for every
`src/pipis/*.ts` file that is not a test, so a new cast fails until it is either removed or given a reason. The byte figure above was measured with `tools/size.ts` by swapping each version in.

**Consequences.** Where a cast costs nothing and the typed version costs bytes in the core, the cast wins, because the core is what
every app pays for. Non-null assertions (`x!`) are forbidden with no opt-outs in the library.
