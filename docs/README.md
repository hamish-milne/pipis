---
description: A small front-end framework for JSX with no virtual DOM and no re-rendering. The guide, the reference and the design decisions start here.
tags: [getting-started]
---
# pipis documentation

A small front-end framework for JSX: no virtual DOM, no re-rendering, and a component that runs once.

## Start

- [Introduction](start/introduction.md): what it is, and what it costs.
- [Getting started](start/getting-started.md): install it, set up JSX, build a small app.

## Guide

- [Reactive values](guide/reactive-values.md): state, derived values, and how a value reaches the DOM.
- [Dynamic UI](guide/dynamic-ui.md): showing, choosing, listing and rebuilding content.
- [Utilities](guide/utilities.md): effects, `Suspense`, portals, the document head, error boundaries and context.
- [Comparison with React](guide/comparison-with-react.md): what you know, in pipis terms.
- [Patterns and pitfalls](guide/patterns-and-pitfalls.md): the details that are easy to get wrong.
- [Custom elements](guide/custom-elements.md): writing your own element, and the head it returns.
- [Lifecycle](guide/lifecycle.md): construct, mount, update, move and unmount.
- [Server rendering](guide/server-rendering.md): HTML on a server or at build time, from the same components.
- [Caveats and non-goals](guide/non-goals.md): what it does not do.
- [Cookbook](guide/cookbook.md): using it with other state libraries, and with libraries that draw.

## Demos

- [Demos](demos/README.md): whole apps, running, with their source.
- [Todo list](demos/todo.md): array state, a row for each item, and reordering.
- [Weather](demos/weather.md): loading data with `Suspense`, and a theme kept in storage.
- [Feedback](demos/feedback.md): context, portals, a modal, and an error boundary.

## Reference

- [API reference](reference/api.md): every export, with its signature. Generated from the source.
- [Design decisions](adr/README.md): each assumption the library is built on, with the tests and measurements that could show it wrong.

## For contributors

- [Writing documentation](authoring.md): how a code block becomes a live example, and what is checked.
- [CONTRIBUTING](../CONTRIBUTING.md) and [RUNBOOKS](../RUNBOOKS.md).
- [LLM.md](../LLM.md): the reference written for AI coding agents.
