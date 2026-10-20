---
tags: [ssr, platform, size]
---
# 19. The server is another build of `pipis`, chosen by the bundler

**Decision.** What the nodes of an element are made with is a _platform_, and there are two. `platform.client.ts` is the document's own,
and is what `pipis` is by default. `platform.server.ts` makes nodes that are plain objects (a parent, siblings, attributes) and reads
markup off them; it touches no global and has no `document`. The library imports its platform through an import of the package itself,
`#platform`, which `package.json` maps to the server's under the condition **`pipis-server`** and to the browser's otherwise. So a bundler
(or `node --conditions=pipis-server`) decides, for the whole of a build, which `pipis` every file gets, and a component says nothing
about it. The platform provides six things: `IS_CLIENT`, `textNode`, `createMarker`, `createNode`, `setAttribute` and `head`, and
`packages/pipis/types/platform.check.ts` compiles each platform against `Platform` (`platform.ts`) so they cannot drift. Everything else is shared:
`createElement` and its bindings, `Fragment`, `reactive`, `select`, and every structural element run unchanged on either. `pipis/server`
is the fourth entry point, with `renderToString` and `serializeData`.

On the server, effects (`Effect`, `Watch`, and so `Portal` and `Suspense`'s promise) are not run, a `ref` is not given, and an event
handler is not written: they are for a screen. `IS_CLIENT` is a constant, so these tests, and anything an app guards with it, are
removed from the build that cannot take them.

**Why.** Considered and rejected:

- **A provider read at run time** (a table of node functions that a server replaces). Every browser app would pay for the indirection in
  every `createElement`, and size is a headline number ([ADR 15](0015-size.md)). A build-time choice costs a browser nothing for what it
  does not use.
- **A fake `document` installed as globals while rendering.** It needs no bundler setting, but it puts globals in the process for the
  length of a render, makes `typeof document` lie to every library that is loaded, and can only be a run-time check, so the browser's
  bundle would carry the server's tests.
- **A DOM library** (jsdom, linkedom, happy-dom). Each would be a runtime dependency of the package, which has none, and the markup
  would be theirs, not ours.

The condition has a safe default: Node, a test in jsdom and every browser bundle get the browser's build with no setting, and a server
that forgets the condition fails at its first element (`document is not defined`), and `renderToString` says which setting is missing.
Server rendering is opted into, never fallen into.

**Evidence.**

- `packages/pipis/tools/server.test.ts` renders the same components twice, with the browser's build in jsdom and with the server's build (bundled with the
  condition, as an app would be), and compares the markup: 21 hand-written pieces of UI (forms, tables, SVG, lists, nested structure, an
  error boundary, `Helmet`, escaping) and every live example of the documentation, with the few things that differ by design named
  (an example that makes nodes with `document`; an effect that sets the title; a portal, which an effect renders). The property
  reflection table the server uses is generated from jsdom by `packages/pipis/tools/reflect.ts`, and the test fails if it is stale or if a prop is
  written differently.
- `packages/pipis/src/render.server.test.tsx` (the `server` project: no DOM at all, `pipis` resolved with the condition) holds what a server
  renders and does not: escaping, void and raw-text elements, boolean attributes, `style`, form state, structure, no effects, no refs,
  the head, that every subscription is let go, and that a render is its own after one that threw.
- `packages/pipis/tools/pack.test.ts` installs the tarball into a clean project and checks that `imports` and the fourth entry point resolve, that the
  app type-checks with `pipis/server` under `bundler` and `node16` resolution, that it renders with `--conditions=pipis-server` and no
  DOM, and that without the condition `renderToString` says so. `packages/pipis/tools/deps.test.ts` holds the layers: only `core`, `dynamic` and `server`
  import `#platform`, and neither platform imports the other.
- **Measurement.** The seam costs a browser app **31 bytes raw and 9 to 16 bytes gzipped** (a static element 802 to 811, the counter app
  1138 to 1152, everything 2426 to 2458), the function boundary around `createNode`; `Helmet` costs 25 more for `head()`. `IS_CLIENT`
  itself costs nothing: in a browser's build the test folds to nothing. `node packages/pipis/tools/size.ts` has the table.

**Consequences.** A server build needs the condition and, in Vite, `ssr.noExternal: ['pipis']`, because Vite would otherwise leave the
package for Node to load. The server's `createNode` decides the namespace from a list of HTML's tags rather than from DOM classes, so
it follows the list that `packages/pipis/tools/reflect.ts` writes from jsdom. Attribute values escape `<` and `>` (the current HTML standard does; an
older jsdom does not), which parses to the same value. A prop given `null` or `undefined` is no attribute on either platform (the browser's
`setAttribute` assigns the empty string and removes the attribute, which costs 58 bytes gzipped: the DOM would otherwise write the text
`undefined`, or an empty attribute that is not the same as none), and the differential test holds the two to it. The browser does not adopt the server's markup: it mounts its own over it.
