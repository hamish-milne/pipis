# 6. Updates are synchronous and unbatched

**Decision.** Writing `.value` notifies every subscriber, in the order they subscribed, before the assignment returns. Nothing is
batched or deferred. Subscribers are notified from a snapshot taken when the write happens: one added during the notification is not
called again by it, and one removed during it is skipped.

**Why.** It keeps the model simple (the DOM is already updated when the assignment returns) and needs no scheduler.

**Evidence.**

- `reactive.test.ts`: order of notification; a subscriber added mid-notification is called once; one removed mid-notification is skipped.
- `assumptions.test.ts`, "ADR 6": 100 patches produce 100 notifications, and the DOM is updated when the assignment returns.
- `bench`, 1,000 `patch` calls on state with 5 bound fields: 0.6 ms (0.4 ms for plain assignment of a new object, so the deep merge is
  the difference); 1,000 patches that each change all 5 fields: 2 ms.

**Consequences.** Several writes in a row cause several updates; combine related changes into one write (`patch` with several keys, or
one new object). A write made from inside a subscriber is delivered at once, ahead of the notification still running, so a later
subscriber sees the values out of order and is left with a stale one. That is an antipattern (`LLM.md` mistake 10); it is documented
and pinned by a test (`reactive.test.ts`) as expected behaviour, not fixed.
