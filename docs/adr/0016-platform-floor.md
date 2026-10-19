# 16. The platform floor is ES2015 for APIs; the syntax is the app's bundler's to lower

**Decision.** A library module calls only built-ins and DOM APIs that ES2015 browsers have, and uses no Node types. That is the lowest
floor the library can have: it needs `Map`, `Set` and `Symbol`, which are ES2015. The syntax is a separate matter. The package ships as
written, with no transpiling, so it uses ES2020 and ES2021 syntax (`??`, `?.` and `??=`). An app that targets a browser older than that
lowers `node_modules/pipis` with its bundler (Vite's esbuild lowers dependencies to its build target; Babel and SWC can be set to), which
it can do for syntax and cannot do for a missing library call.

**Why.** A call to an API that is not there fails, and nothing in an app can fix it; syntax that is not understood is rewritten by the
tool that builds the app. So the floor is set by the APIs, and the syntax is documented. Lowering the syntax ourselves would mean a build
step, and the package is deliberately the source with its types blanked out (ADR 17).

**Evidence.** Three checks hold it, all part of `all`:

- `tsconfig.lib.json` compiles every library module against the **ES2015** built-ins and the DOM with no Node types, so `Array.prototype.flat`,
  `includes`, `Object.entries`, `Object.fromEntries`, `Object.hasOwn`, `at`, `toSorted` and the like are type errors there.
- The `baseline-js/use-baseline` lint rule, at **Baseline 2015** for Web APIs and JS built-ins, runs on every library file and reports a
  newer global (`structuredClone` is Baseline 2022, `Reflect` is 2016). The library has no `env` set for the linter, so a global the
  language does not declare is reported and not assumed.
- The same rule reports newer syntax it recognises (`async` functions, `**`), unless the feature is in the `ignoreFeatures` list in
  `vite.config.ts`. That list is the syntax the library is written in (`let` and `const`, classes, destructuring, spread, `??`, `??=`;
  Baseline dates several of them later than ES2015 because of early engine bugs), so using a new kind of syntax is a decision. The rule
  does not recognise every syntax feature (`?.` is not reported), so the list records intent and is not a complete guard.

Adding a deliberate violation of each (`structuredClone`, an `async` function, `**`, `Object.fromEntries`) fails the check.

**Consequences.** Tests, tools and the docs site are not held to it: they run on the repository's own Node and in current browsers. Nothing
runs the packaged library on an engine as old as the floor, because the tests need a DOM and Vitest cannot run on one, so the floor is
enforced statically and not by execution. Moving it is a deliberate change (`RUNBOOKS.md`, "Move the platform floor").
