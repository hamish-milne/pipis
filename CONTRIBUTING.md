# Contributing to pipis

This guide is for everyone who changes the repository: people, and AI coding agents. It says what the project values, the rules the checks enforce, and how to know a change is done. Chores that come round (updating dependencies or actions, changing the Node version) are step by step in [RUNBOOKS.md](RUNBOOKS.md).

If you are an agent: read this file before editing, run the whole check before saying a change is finished, and read its output, not just its exit code.

## Getting started

You need Node 24 or later (CI uses Node 26) and pnpm. `packageManager` in `package.json` pins the pnpm version; enable it with `corepack enable pnpm`. The Node requirement is for this repository's tooling; the library itself runs in any browser.

```sh
pnpm install
pnpm exec playwright install chromium   # the DOM tests also run in Chromium; or set PIPIS_CHROMIUM to a Chromium you have
pnpm vp run --concurrency-limit 2 all   # everything CI runs
```

The toolchain is [Vite+](https://viteplus.dev) (`vp`): tests, lint, format, the site build and a task runner behind one config file, `vite.config.ts`.

| Command                         | What it does                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm vp run all`               | Everything CI runs. Run it with `--concurrency-limit 2`: tests that run against the clock flake under load. |
| `pnpm vp test run <file>`       | One test file, in jsdom and Chromium. Without a path: all of them. Add `--project jsdom` for the fast loop. |
| `pnpm vp run check`             | The type check (`tsc -p .`).                                                                                |
| `pnpm vp lint`                  | Lint. `pnpm vp run lint` is the strict form CI uses (no warnings, no unused disable comments).              |
| `pnpm vp fmt`                   | Format. It rewrites files, so run it _before_ a scripted find-and-replace.                                  |
| `pnpm vp dev`                   | The documentation site, served with a reload when the docs, the site or the library change.                  |
| `pnpm vp run build`             | The site's production build, into `dist/` (`node site/serve.ts` serves it). `site:test` tests it in Chromium. |
| `pnpm vp run size`              | What each feature costs an app, in bytes (`size:check` is the gate and is part of `all`).                  |
| `node tools/bench.ts`           | The micro-benchmark, in real Chromium. Run by hand before and after a change to a hot path.                |

`pnpm vp run --concurrency-limit 2 all` is the definition of green. A change is not finished until it passes with no warnings.

## What pipis values

When a rule does not cover a case, decide by these.

- **Small, and pay for what you use.** Features are opt-in by import (`core`, then `reactive`, then `dynamic`). A feature that makes everything bigger is a bug; measure it.
- **Zero runtime dependencies.** The library imports nothing but itself. The answer to a new runtime dependency is no.
- **Components run once.** There is no virtual DOM and no re-rendering: reactive values bind straight to DOM nodes. A new capability fits that model or does not belong.
- **Honest errors.** A mistake the user can make fails early, with a message that names the thing and says what to do. A mistake the type checker already rejects needs no runtime check: where the compiler catches it, the runtime behaviour for that case matters far less.
- **Docs and examples that cannot rot.** If it is documented it is tested.
- **Written for readers, human and model.** Say _why_, not what. `LLM.md` is the reference written for AI agents; it must stay true.
- **One definition of green, and it is the whole check.**

## The repository

```text
src/pipis/      the library: base.ts, core.ts, reactive.ts, dynamic.ts, svg.ts, and the jsx-runtime entry points, with a *.test.ts beside each.
                index.ts is the barrel (`export *` of base, core, reactive and dynamic, and the platform's three public names): a module imports
                what it needs from the module that has it, not through core. What is the library's own and not an app's is in internal.ts
                What the nodes are made with is a platform, chosen by the bundler (ADR 19): platform.client.ts (the document's, the default) and
                platform.server.ts (plain objects that are read as HTML) and platform.hydrate.ts (the document's, which adopts a page that a server wrote: ADR 21),
                each exporting what platform.ts says; server.ts is `pipis/server` and hydrate.ts `pipis/hydrate`. hydrated.ts is the one seam to the hydrating platform.
                A test of server rendering is named *.server.test.ts and of hydration *.hydrate.test.tsx; each runs in its own project, with `pipis` as that platform
src/test/       helpers and setup for the tests (not part of the library)
src/types/      type-level tests: code that is compiled by `tsc` and never run (LLM.md's snippets)
docs/           the documentation, in Markdown: start/, guide/, reference/ (generated) and adr/ (the design decisions)
src/samples/    the demo apps, which the site shows (`demo-app.html` is the page they are built into)
docs-kit/       the documentation site's engine: Markdown read into tokens, pages and navigation, the live examples' frames and editor, the search. It knows nothing of pipis
site/           this site, a pipis app on the kit: the document and layout, the Markdown component and the renderer for the docs, the islands (islands.tsx, search.tsx) and the script that mounts them (client.ts), the style sheet, the adapter that mounts an example, the build and the tests
tools/          repository tooling, written in TypeScript and run directly by Node (the action-pin check, the size tool, the benchmark,
                the import-layer check, and the packer and its test)
docs/adr/      the design assumptions, one record each, with the tests and measurements that could disprove them
LLM.md          the reference written for AI agents
```

## Code standards

### TypeScript

- **Strict, and erasable only.** The compiler runs with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noUnusedLocals`. `erasableSyntaxOnly` is on, because the library is to be shipped as its own source with the types blanked out: no `enum`, no `namespace` (other than `declare`), no parameter properties.
- **Import with the real extension:** `import { x } from './x.ts'`. Type-only imports use `import type` or `{ type X }` (`verbatimModuleSyntax`).
- **No `any`, no `@ts-ignore`, no `@ts-nocheck`.** `@ts-expect-error` needs a description. Where `any` is truly the honest type, the line opts out with `// oxlint-disable-next-line <rule>` and a reason (see `PropBag` in `core.ts`).
- **No non-null assertions (`x!`).** Narrow, guard, or restructure.
- **No casts (`as T`) in the library.** The rule is on for every `src/pipis` module that is not a test. Where a cast is the honest answer, the line opts out with `// oxlint-disable-next-line typescript/consistent-type-assertions -- <reason>`; there are a handful, each in [ADR 18](docs/adr/0018-casts-and-any.md). Prefer narrowing, a type guard, a generic, or `unknown` through an implementation behind a typed overload. Tests, tools and the site are not held to it.
- **Unused lint directives fail the build.** Delete an opt-out when the code it excused is gone.
- **Format is the formatter's** (oxfmt: width 140, single quotes). Do not hand-format against it, and do not mix reformatting into a change. A formatter run is its own commit, listed in `.git-blame-ignore-revs`.
- **Comments explain why:** a constraint, an invariant, a decision. No narration of the next line, no commented-out code. A change that makes a comment wrong fixes it in the same commit.

## Tests

- **Style:** `describe` / `it` / `expect`, imported from `vite-plus/test`. One behaviour per `it`, named so that the failure report reads as a specification ("List > keeps the same row nodes when the list is reordered"). inkplot writes script-style tests with `node:assert`; pipis does not, because its tests are many small independent behaviours that need a DOM anyway.
- **Where:** `src/pipis/<module>.test.ts` beside the module. `leaks.test.ts` holds the checks that nothing is left subscribed after unmount.
- **Two environments.** Every test file runs twice, in jsdom (fast) and in real Chromium (what the library is for). A behaviour that only a real browser has (jsdom has no MathML) skips itself with `realBrowser` from `src/test/dom.ts`. A test that passes in one and fails in the other is a finding, not a flake: find out which DOM is right.
- **Helpers** are in `src/test/dom.ts`: `mount(element)` (a fresh container, removed after the test, with `unmount`), `h(tag, props, ...children)` (`createElement` without the per-tag prop types), `html(node)` (markup without the comment anchors), `tracked(value)` (a reactive that counts live subscriptions) and `quiet(fn)` (swallows errors a test expects). Reset shared state in `afterEach`, never rely on test order.
- **Assert on the real output:** the DOM that results, the values a subscriber was given, the number of subscriptions left. Not that "something rendered".
- **Deterministic:** no network, no `Math.random()`, no wall-clock assertions. Settle a promise by hand (`deferred()` in `dynamic.test.ts`) and flush it; use fake timers for time.
- **Type-level tests** are `src/types/*.check.tsx`, compiled by the `check` task and never run. A mistake that LLM.md calls a type error is a statement under `// @ts-expect-error <why>`; if the types start to accept it, the unused directive fails the build. Code that LLM.md recommends is compiled as written. When LLM.md changes, change the matching snippet here.
- **Coverage** is recorded on every run (`pnpm vp run test`) and commented on pull requests. It is a signal, not a target.

### Known bugs are tests that fail on purpose

A bug that has not been fixed yet is a test that states the _correct_ behaviour and is marked `it.fails` (when several tests share one bug, a named alias for `it.fails` in `src/test/dom.ts`, whose comment says what is broken and why). The check stays green while the bug is known, and turns red the moment it is fixed, which is the prompt to remove the marker. So:

- Fixing a bug means the test for it starts failing as a "failed expectation to fail". Change `it.fails` to `it` (for an alias, change the one line that defines it) in the same commit as the fix.
- Before trusting a new `it.fails`, run it as a plain `it` once and read the failure: it must fail on the assertion you mean, not on a typo.
- Do not add an `it.fails` to hide a failure you do not understand.

## Architecture rules the checks hold

- **The library is layers an app opts into by importing them.** `tools/deps.ts` says what each module of `src/pipis` may import at run time: `core` nothing; `reactive` only `core`; `dynamic` `core` and `reactive`; `jsx-runtime` only `core`; `jsx-dev-runtime` `jsx-runtime`. A module that needs another has to say so there, on purpose, and `pnpm vp run deps` fails (with the module named) on any other import, any cycle, any import from outside the library, and any new file in `src/pipis` that has not been classified. Only _runtime_ imports count: a type-only import is free, so write `import type` for one.
- **The platform floor is ES2015 for APIs** ([ADR 16](docs/adr/0016-platform-floor.md)); the syntax is newer and is the app's bundler's to lower. `tsconfig.lib.json` compiles the library against ES2015 built-ins with no Node types (`Array.prototype.flat`, `includes`, `Object.entries`, `at` and `toSorted` are errors), and a lint rule at Baseline 2015 reports newer global APIs and syntax that is not on its accepted list. A newer API behind a real feature check gets a lint comment that says so. Tests, tools and the docs site are not held to it.
- **The package is the source with its types blanked out** ([ADR 17](docs/adr/0017-package-shape.md)), which is why the code is erasable TypeScript only. `pnpm vp run pack:test` builds it, installs it into a clean project, type-checks a JSX app there under `bundler` and `node16` resolution, and runs it. A change to what ships (a new module, an entry point) shows up there first.

## Design decisions

The assumptions pipis is built on are written down in [docs/adr/](docs/adr/README.md), one short record each: the decision, why, the
tests or measurements that could show it wrong, and what it costs. A change that alters one of them is a new record that says so, in
the same commit as the change; a record is not edited to match the code. When a test or a measurement contradicts a record, that is a
finding, and it is fixed or the record is superseded.

## Size and speed

- **Size** is measured by `node tools/size.ts` on small programs that use pipis the way an app would, and held by `size:check` (part of
  `all`) against `tools/size-baseline.json`: gzip, 2% and 16 bytes of room. A change that grows the baseline says by how much, and why it
  is worth it, in the commit message (see [RUNBOOKS](RUNBOOKS.md#change-the-size-baseline)). A feature that makes the core bigger is a
  layering mistake. Only numbers from this table go in the README.
- **Speed** is measured by `node tools/bench.ts`, in Chromium. It is not part of `all` because timings depend on the machine. Before and
  after a change to a hot path (`reactive`, `select`, `createElement`, `List`), run it and put both tables in the commit message. Do
  not optimise without a number.

## Making a change

- **Every behaviour change comes with a test that fails without it.** A bug fix starts with the test that reproduces the bug.
- **Do not delete a test to make a change pass.** Change it when its expectation is what changed, and say so in the commit.
- **A change to documented behaviour changes the docs in the same commit**, including `LLM.md` and the examples in it.
- **Docs are code.** Every `live` and `check` block in `docs/` is compiled and every `live` one is run (`pnpm vp run docs`); see [docs/authoring.md](docs/authoring.md). The complete examples of `LLM.md` are compiled as written, and its API snippets must be lines of `src/types/llm.check.tsx`.
- **Every export is documented.** The first sentence of its doc comment stands alone: it is what the generated [API reference](docs/reference/api.md) shows. After changing an export or its comment, run `node tools/api.ts --out docs/reference/api.md` and commit the result with the change; the docs check fails if it is stale. A new export also goes in `STRUCTURE` in `tools/api.ts`.
- **A change to a public default, or a removed export, is breaking:** say so in the commit message.

## Commits and pull requests

- **One logical change per commit,** with the checks green at each. A refactor that must land with a behaviour change goes first, as its own commit, with no behaviour change.
- **Subject:** a sentence under about 72 characters, no prefix, saying what the change _lets_ the library do. **Body:** why, what the design is, what it does not do, and any behaviour a user would notice.
- **Rebase, do not merge:** `git pull --rebase` before pushing. Do not rewrite history on `main`.
- **Mechanical changes** (a formatter run, a rename across files) are their own commit, and their hash goes in `.git-blame-ignore-revs`.
- **Attribution:** commits made with an AI tool carry the tool's `Co-Authored-By` trailer; the human who sends the change is responsible for it.
- **Pull requests** say what changed and why, how it was verified (the commands run), and what a reviewer should look at first.

## Working as an agent

- **Start by saying what you are about to do.** For a broad change, plan it with the user first; for a clear one, start.
- **Run the whole check and read the output.** Run a failing test alone to read the real error.
- **Report honestly.** Say what was verified and what was only reasoned. Never claim a check you did not run.
- **Ask when the design is the question;** otherwise make the call, say what you decided, and keep the change small enough to review.
- **Run `pnpm vp fmt` before a scripted edit.** The formatter reflows code, so a replacement written against remembered text can silently fail to match.
- **Do not add dependencies,** `any`, `as`, `!` or `@ts-ignore` to get past a check. Fix the type.
- **The sandbox may not reach the network.** Do not retry with other commands; say so and use what is in the repository.
- **Keep scratch files out of the tree:** put them under `out/` (ignored), and `git status` before committing.
