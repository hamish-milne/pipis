# Contributing to pipis

This guide is for everyone who changes the repository: people, and AI coding agents. It says what the project values, the rules the checks enforce, and how to know a change is done. Chores that come round (updating dependencies or actions, changing the Node version) are step by step in [RUNBOOKS.md](RUNBOOKS.md).

If you are an agent: read this file before editing, run the whole check before saying a change is finished, and read its output, not just its exit code.

## Getting started

You need Node 24 or later (CI uses Node 26) and pnpm. `packageManager` in `package.json` pins the pnpm version; enable it with `corepack enable pnpm`. The Node requirement is for this repository's tooling; the library itself runs in any browser.

```sh
pnpm install
pnpm vp run --concurrency-limit 2 all   # everything CI runs
```

The toolchain is [Vite+](https://viteplus.dev) (`vp`): tests, lint, format, the site build and a task runner behind one config file, `vite.config.ts`.

| Command                         | What it does                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm vp run all`               | Everything CI runs. Run it with `--concurrency-limit 2`: tests that run against the clock flake under load. |
| `pnpm vp test run <file>`       | One test file. Without a path: all of them.                                                                 |
| `pnpm vp run check`             | The type check (`tsc -p .`).                                                                                |
| `pnpm vp lint`                  | Lint. `pnpm vp run lint` is the strict form CI uses (no warnings, no unused disable comments).              |
| `pnpm vp fmt`                   | Format. It rewrites files, so run it _before_ a scripted find-and-replace.                                  |
| `pnpm vp dev` / `pnpm vp build` | The samples and docs site, and its production build.                                                        |

`pnpm vp run --concurrency-limit 2 all` is the definition of green. A change is not finished until it passes with no warnings.

## What pipis values

When a rule does not cover a case, decide by these.

- **Small, and pay for what you use.** Features are opt-in by import (`core`, then `reactive`, then `dynamic`). A feature that makes everything bigger is a bug; measure it.
- **Zero runtime dependencies.** The library imports nothing but itself. The answer to a new runtime dependency is no.
- **Components run once.** There is no virtual DOM and no re-rendering: reactive values bind straight to DOM nodes. A new capability fits that model or does not belong.
- **Honest errors.** A mistake the user can make fails early, with a message that names the thing and says what to do.
- **Docs and examples that cannot rot.** If it is documented it is tested.
- **Written for readers, human and model.** Say _why_, not what. `LLM.md` is the reference written for AI agents; it must stay true.
- **One definition of green, and it is the whole check.**

## The repository

```text
src/pipis/      the library: core.ts, reactive.ts, dynamic.ts, svg.ts, and the jsx-runtime entry points
                (markdown.tsx and highlight.tsx are helpers for the docs site: they use dev dependencies and are not exported)
src/docs/       the documentation pages and the site that renders them
src/samples/    sample apps
tools/          repository tooling (the action-pin check)
LLM.md          the reference written for AI agents
```

## Code standards

### TypeScript

- **Strict, and erasable only.** The compiler runs with `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `noUnusedLocals`. `erasableSyntaxOnly` is on, because the library is to be shipped as its own source with the types blanked out: no `enum`, no `namespace` (other than `declare`), no parameter properties.
- **Import with the real extension:** `import { x } from './x.ts'`. Type-only imports use `import type` or `{ type X }` (`verbatimModuleSyntax`).
- **No `any`, no `@ts-ignore`, no `@ts-nocheck`.** `@ts-expect-error` needs a description. Where `any` is truly the honest type, the line opts out with `// oxlint-disable-next-line <rule>` and a reason (see `PropBag` in `core.ts`).
- **No non-null assertions (`x!`).** Narrow, guard, or restructure.
- **Casts (`as T`) are discouraged** and are audited in a later phase; do not add new ones where narrowing, a type guard or a generic will do.
- **Unused lint directives fail the build.** Delete an opt-out when the code it excused is gone.
- **Format is the formatter's** (oxfmt: width 140, single quotes). Do not hand-format against it, and do not mix reformatting into a change. A formatter run is its own commit, listed in `.git-blame-ignore-revs`.
- **Comments explain why:** a constraint, an invariant, a decision. No narration of the next line, no commented-out code. A change that makes a comment wrong fixes it in the same commit.

## Making a change

- **Every behaviour change comes with a test that fails without it.** A bug fix starts with the test that reproduces the bug. Tests sit beside the module, as `src/pipis/<module>.test.ts`.
- **Do not delete a test to make a change pass.** Change it when its expectation is what changed, and say so in the commit.
- **A change to documented behaviour changes the docs in the same commit**, including `LLM.md` and the examples in it.
- **A change to a public default, or a removed export, is breaking:** say so in the commit message.
- **Deterministic tests:** no network, no `Math.random()`, no wall-clock assertions.

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
