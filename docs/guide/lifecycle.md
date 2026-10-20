---
description: Construct, mount, update, move and unmount: what runs when.
tags: [lifecycle, effects, performance]
---
# Lifecycle

Components and elements have a lifecycle that follows the lifecycle of the platform underneath them, JavaScript and the DOM. This page walks through it, and says what belongs in each step.

## Definition

A component is a function that takes props and returns an element. Components are usually defined at module scope, and can be used any number of times.

## Construction

A component is called, directly or through JSX, and returns an element.

- Anything that depends only on the props, such as DOM nodes and other objects, can be prepared here.
- This step, the component body, should be **idempotent**: it should be possible to do it again without side effects. Do not subscribe to anything here; a subscription belongs in the mount step.
- A component runs once, so this is where reactive state is created and elements are built.

## Mount

The element is called with a parent and a sibling, and returns its head.

- When this step completes the element is in the document. Reactive subscriptions are made here, and this step can, and usually should, have side effects.
- Side effects should be **reversible** on unmount where that is practical. Some are not, such as a component that fetches data or focuses a control when it mounts.
- An element can be mounted and unmounted many times over the life of an app, so mounting should be cheap.
- Do not change application state while mounting: mounting a component should not change what the app knows. `Portal` is the one case where mounting makes content appear somewhere else, and it does that through a reactive value.

## Update

Whatever subscriptions an element made on mount can fire at any time, usually from an outside event such as a network response or a click.

- The element may do whatever it likes in response: change attributes, or build, mount and unmount other elements.
- Events can be frequent, so performance matters most here.
- Do not mix state updates and DOM events in one handler. The pattern is either a DOM event that updates state, or a state change that updates the DOM. Anything else risks an [update loop](patterns-and-pitfalls.md#update-loops).

## Move

If an element that is already mounted is mounted again with a different parent or sibling, the effect is that of unmounting it and mounting it again.

- Lists move elements often. It is the element's job to check whether a change is needed and skip the work if not. Mounting an element at the parent and sibling it already has changes nothing observable.

## Unmount

Calling the element with no arguments unmounts it.

- When this step completes the element is no longer in the document, and nothing inside it is still subscribed: unmounting an HTML or SVG element unmounts its children first, so every cleanup runs.
- Only clean up and remove here. Do not update state.
- The element can be mounted again later, so do not do anything that cannot be undone.

## Garbage collection

When an element or component has no more references, the runtime reclaims it. To avoid leaks, make sure the definition and construction steps do not create anything that outlives their scope, and that every subscription is made on mount and ended on unmount. The library's own tests check this for every element: after unmounting, nothing is left subscribed ([ADR 11](../adr/0011-mount-and-unmount.md)).
