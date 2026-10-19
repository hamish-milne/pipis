# Architecture decision records

Each record states one design assumption of pipis, why it was made, the evidence that could show it wrong (a test or a measurement,
named so it can be found), and what it costs. A record is changed only by a later record that replaces it.

How to read the evidence: **tests** are in `src/pipis/*.test.ts` and run on every change; **measurements** come from `node tools/size.ts`
and `node tools/bench.ts`. The bench numbers are from one machine (Chromium 156 on Windows 11, median of 9 runs after 2 warm-ups):
compare ratios, not the absolute figures.

| #                                          | Decision                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| [1](0001-components-run-once.md)           | A component runs once; reactive values bind straight to DOM nodes           |
| [2](0002-select.md)                        | `select` takes two arguments, computes per subscriber, and is not shared    |
| [3](0003-if-takes-a-reactive.md)           | `If` takes a reactive boolean, and anything computed is a `select`          |
| [4](0004-list-rows.md)                     | `List` for items that do not change, `ReactiveList` for rows that do        |
| [5](0005-no-key-prop.md)                   | There is no `key` prop                                                      |
| [6](0006-synchronous-unbatched-updates.md) | Updates are synchronous and unbatched                                       |
| [7](0007-effects.md)                       | An `Effect` runs on mount, cleans up on unmount, and goes first             |
| [8](0008-lowercase-events.md)              | Events use the native lowercase property names                              |
| [9](0009-reactive-style.md)                | `style` is reactive one property at a time                                  |
| [10](0010-interop-through-adapt.md)        | `adapt` makes a Reactive from another library's store, signal or Observable |
| [11](0011-mount-and-unmount.md)            | Mounting is idempotent and unmounting leaves nothing behind                 |
| [12](0012-error-handling.md)               | Errors go to the handler that was current when the subscription was made    |
| [13](0013-namespaces.md)                   | HTML is tried first, then SVG; MathML is not supported                      |
| [14](0014-suspense.md)                     | `Suspense`: the latest promise wins                                         |
| [15](0015-size.md)                         | Size claims are measured, and a gate holds them                             |
| [16](0016-platform-floor.md)               | The platform floor is Baseline 2021                                         |
| [17](0017-package-shape.md)                | The package ships its own source, with the types blanked out                |
| [18](0018-casts-and-any.md)                | Casts and `any` in the library are owned in writing                         |
