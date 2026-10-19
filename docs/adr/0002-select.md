# 2. `select` takes two arguments, computes per subscriber, and is not shared

**Decision.** `select(input, compute)` or `select(input, key)` derives a read-only reactive from exactly one input. It notifies only
when the result changes (`!==`). There is no multi-input form: related state lives in one reactive object and is selected from.
A `select` is cold: each subscriber computes its own copy, and nothing is shared between them.

**Why.** One input means a derived value can never be glitched by two inputs updating one after the other, and keeps `select` tiny.

**Evidence** (`reactive.test.ts`, "select").

- Computes once per subscriber and per change (two subscribers, two computations).
- Goes stale when it reads other state through a closure (`LLM.md` mistake 8): it recomputes when its input changes, not when something
  it reads inside the callback does.
- Two selects of one source are notified one after the other, so code that reads both can see one new and one old between the
  notifications. This is why there is no `combine`.
- Three arguments, and several inputs, are type errors (`src/types/llm.check.tsx`).
- A compute function that throws is reported to the error handler and the select keeps its last value (ADR 12).

**Consequences.** Cold selects cannot share an expensive derived value. A list of N rows in which every row selects its own data from
one array does N searches per change, and an index derived with `select` would be rebuilt by every row. `ReactiveList` (ADR 4) exists to
avoid both. A chain of 10 selects costs about 260 ns per write, so depth is cheap and fan-out is what costs.
