---
tags: [ssr, size, components]
---

# 20. Islands are mounted over the server's markup

**Decision.** A page that is made on a server and is mostly not interactive has islands: components that the page uses with `Island`, and the
browser's script mounts with `mountIslands` (both in `pipis/islands`). On a server `Island` writes the component's markup inside an element
(`<div data-island="name" data-props="{json}" style="display: contents">`); in the browser it is only the component. `mountIslands` finds the
markers, makes the component of that name with the props it finds, replaces the marker's content with the component's own mount, and returns
what unmounts them all. An island that throws, or has no component given, is reported and the others are mounted. Nothing in the core changed:
this is the library's own `createElement` and mount, used from a marker.

**Why.** It is the smallest thing that keeps a page complete without a script and puts only the interactive code in the browser. The page's
markup, and what only made it (a Markdown parser, a highlighter), are not imported by what the browser runs, so they are not in its bundle.
Adopting the server's nodes instead (hydration) changes how every element is made ([ADR 19](0019-server-rendering.md), and the identity of a
node being fixed at construction), and is a decision for a later record, taken with this one's evidence.

**Evidence.**

- `src/pipis/islands.server.test.tsx` (the server build, no DOM): the marker's markup, props that cannot end the attribute or begin a tag, a
  component without props, the marker among a page's elements. `src/pipis/islands.test.tsx` (jsdom and Chromium): the island is mounted over the
  markup with its props and the rest of the page is untouched, several islands have their own props, one is not mounted twice, they unmount, an
  island inside one that was mounted is not made, an island that throws or has no component is reported and the others are mounted, and in the
  browser `Island` is only the component.
- `tools/server.test.ts` renders a page with an island on the server, mounts it in jsdom from the browser's build, clicks it, and checks that the
  page around it is the same nodes; and that the browser's script, minified, has none of the server's code (its HTML tables, the marker, the
  render).
- The documentation site was first made of it (the theme switch, the menu, the search button, the copy buttons, the bar of each example, the
  contents), with the whole-site tests in Chromium (`site/site.test.ts`). It has since moved to hydration ([ADR 21](0021-hydration.md)), which is the
  comparison that this record's measurement was left for.
- **Measurement.** `mountIslands` costs a browser app 264 bytes gzipped and no server code (`node tools/size.ts`). Replacing the site's
  hand-written script (`page.ts` and `search.ts`, 253 lines that make a statement) with islands made it **larger, not smaller**: 375 lines, and a page
  script of 3.4 KB gzipped, up from 1.4 KB, because it now has pipis in it and the search is a component with its own state. What is better is
  the shape: the buttons are written once and are the server's markup and the browser's, state is a reactive value that the islands share, the
  search is declarative, and a switch's `hidden` is a prop and not a pair of `querySelector` calls. What is not better is in three of the six
  islands (the example's bar, the contents, the copy button), which must reach the page's static markup around them with the DOM (`closest`,
  `querySelector`), and so are the old code again in an `Effect`.

**Consequences.** The server's markup of an island is replaced, not adopted, so what an island shows when first mounted should be what the
server wrote, and a reader who has used an island before the script runs starts it again. Props are JSON. The three islands that work on their
surroundings are the case for a component that can be given static children that the browser adopts and does not make: that is the first
thing hydration should be shown to do for this site, and the numbers above are what it is to be measured against.
