# 17. The package ships its own source, with the types blanked out

**Decision.** `tools/pack.ts` builds the tarball. Each library module's JavaScript is its source with the types removed by Node's own type
stripping (`module.stripTypeScriptTypes`), so every line and column is where it is in the repository, and the only other edit is
`.ts` to `.js` in relative import paths, which is the same length. It is not bundled and not minified: an app bundles the library, and a
stack trace should name the line to open. The declarations come from `tsc`. The package has no dependencies and no peer dependencies, is
marked `sideEffects: false`, and has three entry points: `pipis` (the barrel of `core`, `reactive` and `dynamic`), `pipis/jsx-runtime` and
`pipis/jsx-dev-runtime`. `LLM.md` is in the tarball, so an agent reading `node_modules` reads the reference for the version installed.

**Layers.** Each module is a layer an app opts into by importing it, and `tools/deps.ts` says what each may import at run time:
`core` imports nothing; `reactive` imports `core`; `dynamic` imports `core` and `reactive`; `jsx-runtime` imports `core` only, so JSX over the
core alone does not pull in `reactive`; `jsx-dev-runtime` imports `jsx-runtime`. `svg` is declarations only and ships as `.d.ts` alone.
`markdown` and `highlight` are helpers for the documentation site: they sit beside the library, use `marked` and `highlight.js`, are not in
the package, and nothing in the library may import them.

**Why.** Type stripping needs no build step, keeps the repository the single source of truth, and is why the code is limited to erasable
syntax (no `enum`, no `namespace`, no parameter properties). Keeping the layers declared stops a feature becoming a cost of everything.

**Evidence.**

- `tools/pack.test.ts` builds the tarball, installs it into a clean project, and checks: the metadata and the one version; that every
  `exports` target is in it; that it holds the library and nothing else (no source, tests, site helpers or tooling); that each `.js` has
  exactly the lines of its source; and that every relative specifier names a file in the tarball.
- In that project, a JSX app that uses every element and `jsxImportSource: pipis` type-checks with library checking on under both
  `moduleResolution: bundler` and `module: node16`; a file of five mistakes `LLM.md` names is rejected on exactly those five lines (so
  the types are real, not `any`); and the packaged JavaScript runs in a DOM through each entry point's `exports`.
- `tools/deps.test.ts`: each module imports at run time exactly what it is allowed (a stale permission fails too), `core` imports nothing,
  no library module imports from outside the library or imports an extra, there is no cycle, every file in `src/pipis` is classified, and
  the barrel re-exports exactly the three modules and not the JSX runtime.

**Consequences.** Declarations name their neighbours as `./x.js`, which every module resolution reads as `x.d.ts`. Node may mark type stripping
experimental; the packer drops that one warning and prints any other, and the pack test is what would notice its output changing. The release is a GitHub release that runs `all`, builds this tarball
and stages it on npm for a person to approve (`RUNBOOKS.md`, "Release a new version").
