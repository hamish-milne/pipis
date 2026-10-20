---
tags: [async]
---
# 14. `Suspense`: the latest promise wins

**Decision.** When the `promise` of a `Suspense` is a reactive and is reassigned, a promise that has been replaced is stale: however and
whenever it settles, it does not change what is shown.

**Why.** Otherwise a slow request that was superseded can arrive last and overwrite the newer result.

**Evidence.** `dynamic.test.ts`, "Suspense": a slow older promise that resolves after a faster newer one leaves the newer result; the
loading, data and error states and the return to loading on reassignment; nothing visible happens if the promise settles after unmount.

**Consequences.** A stale promise's rejection is also ignored, not reported. A promise function (rather than a reactive) is called once
per mount.
