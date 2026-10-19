# Instructions for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything, and [RUNBOOKS.md](RUNBOOKS.md) for chores such as updating dependencies or actions.

The short version:

- `pnpm vp run --concurrency-limit 2 all` is the definition of green. Read its output: a lint warning or a skipped task is not green.
- A bug fix starts with a test that fails without it. A change to documented behaviour changes the docs in the same commit.
- Tests are `describe`/`it`/`expect`, and every DOM test runs in jsdom and in Chromium (`pnpm exec playwright install chromium`, or `PIPIS_CHROMIUM`). A known bug is a test marked `it.fails` that states the correct behaviour: fixing the bug means removing the marker in the same commit (see CONTRIBUTING, Tests).
- No new dependencies, and no `any`, `@ts-ignore` or `!` to get past a check. Fix the type, or opt out with a comment that gives the reason.
- The library is layers (`core` < `reactive` < `dynamic`, and the JSX runtime over `core`) held by `pnpm vp run deps`, to Baseline 2021 (`tsconfig.lib.json`), with no casts without a written reason. What ships is the source with its types blanked: `pnpm vp run pack:test` builds and installs it.
- The design assumptions are in `docs/adr/`. Size is measured and gated (`pnpm vp run size`); speed by `node tools/bench.ts`. Say what a change costs, with numbers, in the commit.
- `LLM.md` is written for models and is excluded from the formatter. A change to a public API can make it wrong: say so in the commit.
- Scratch files, screenshots and logs go under `out/` (ignored). Run `git status` before committing.
- The sandbox may not reach the network. Use what is in the repository and say so.
