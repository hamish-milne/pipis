# Instructions for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything, and [RUNBOOKS.md](RUNBOOKS.md) for chores such as updating dependencies or actions.

The short version:

- `pnpm vp run --concurrency-limit 2 all` is the definition of green. Read its output: a lint warning or a skipped task is not green.
- A bug fix starts with a test that fails without it. A change to documented behaviour changes the docs in the same commit.
- Tests are `describe`/`it`/`expect`, and every DOM test runs in jsdom and in Chromium (`pnpm exec playwright install chromium`, or `PIPIS_CHROMIUM`). A known bug is a test marked `it.fails` that states the correct behaviour: fixing the bug means removing the marker in the same commit (see CONTRIBUTING, Tests).
- No dependency in the library (it has none), and a new development dependency needs a reason, in the commit. No `any`, `@ts-ignore` or `!` to get past a check. Fix the type, or opt out with a comment that gives the reason.
- The library is layers (`core` < `reactive` < `dynamic`, and the JSX runtime over `core`) held by `pnpm vp run deps`, to Baseline 2021 (`tsconfig.lib.json`), with no casts without a written reason. What ships is the source with its types blanked: `pnpm vp run pack:test` builds and installs it.
- The documentation site is `docs/` built by `docs-kit/` and `site/` (`pnpm vp dev` to work on it, `pnpm vp run build` for `dist/`); `pnpm vp run site:test` builds it and uses it in Chromium. The site is plain files with relative links.
- Docs are code: `docs/` is the single source, every `live`/`check` block in it is compiled and every `live` one is run (`pnpm vp run docs`, see `docs/authoring.md`). `docs/reference/api.md` is generated: after changing an export or its doc comment run `node tools/api.ts --out docs/reference/api.md`.
- The design assumptions are in `docs/adr/`. Size is measured and gated (`pnpm vp run size`); speed by `node tools/bench.ts`. Say what a change costs, with numbers, in the commit.
- `LLM.md` is written for models and is excluded from the formatter. A change to a public API can make it wrong: say so in the commit.
- Scratch files, screenshots and logs go under `out/` (ignored). Run `git status` before committing.
- The sandbox may not reach the network. Use what is in the repository and say so.
