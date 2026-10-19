# 9. `style` is reactive one property at a time

**Decision.** `style` is an object with one entry per CSS property. Each value is a string with units or a `Reactive<string>`. The
object itself is not reactive.

**Why.** Binding each property separately means an animation that changes one property touches only that property, and needs no CSS
string building.

**Evidence.** `core.test.ts`, "style": static properties are applied; each reactive property is bound on its own, follows its value,
and is unsubscribed on unmount. `src/types/llm.check.tsx`: a number is a type error.

**Consequences.** A change to one property writes only that property. Because the object is not reactive, switching between whole
styles means a reactive per property, or a reactive class name.
