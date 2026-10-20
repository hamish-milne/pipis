---
description: Context, portals, a modal, and an error boundary.
tags: [demo, errors, components]
---
# Feedback

A feedback widget that uses the rest of the API. It builds a star rating from an array, passes an accent colour down the tree with [`defineContext`](../reference/api.md#definecontext), renders a modal elsewhere in the document with [`PortalTarget`](../reference/api.md#portaltarget) and [`Portal`](../reference/api.md#portal), shows it with [`If`](../reference/api.md#if), captures a DOM node with a `ref`, and catches a crash on mount with [`ErrorBoundary`](../reference/api.md#errorboundary) and [`Dynamic`](../reference/api.md#dynamic).

```demo
feedback
```
