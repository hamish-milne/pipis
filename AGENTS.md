# Instructions for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything, and [RUNBOOKS.md](RUNBOOKS.md) for chores such as updating dependencies or actions.

The short version:

- `pnpm vp run --concurrency-limit 2 all` is the definition of green. Read its output: a lint warning or a skipped task is not green.
- A bug fix starts with a test that fails without it. A change to documented behaviour changes the docs in the same commit.
- Tests are `describe`/`it`/`expect`, and every DOM test runs in jsdom and in Chromium (`pnpm exec playwright install chromium`, or `PIPIS_CHROMIUM`). A known bug is a test marked `it.fails` that states the correct behaviour: fixing the bug means removing the marker in the same commit (see CONTRIBUTING, Tests).
- No dependency in the library (it has none), and a new development dependency needs a reason, in the commit. No `any`, `@ts-ignore` or `!` to get past a check. Fix the type, or opt out with a comment that gives the reason.
- What the nodes are made with is a platform, chosen by the bundler with the `pipis-server` condition ([ADR 19](docs/adr/0019-server-rendering.md)): code in `core.ts` and `dynamic.ts` is shared, so it must work on both, and anything DOM goes in `platform.client.ts` with its counterpart in `platform.server.ts` (`packages/pipis/types/platform.check.ts` checks they match). A change to markup the server writes is checked against jsdom by `packages/pipis/tools/server.test.ts`.
- The library is layers (`core` < `reactive` < `dynamic`, and the JSX runtime over `core`) held by `pnpm vp run pipis#deps`, to Baseline 2021 (`tsconfig.lib.json`), with no casts without a written reason. What ships is the source with its types blanked: `pnpm vp run pipis#pack:test` builds and installs it (`@pipis/docs-kit#pack:test` does the same for the kit).
- The repository is a pnpm workspace: `packages/pipis` (the library), `packages/docs-kit` (`@pipis/docs-kit`, the Vite plugin that builds a documentation site; library-agnostic), and `apps/docs` (the site: `docs/` built with the kit). A task runs from its package's folder (`pnpm vp run test`) or from the root as `pnpm vp run pipis#test`.
- The documentation site is `docs/` built by `packages/docs-kit/src/` and `apps/docs/` (`pnpm vp dev` in `apps/docs` to work on it, `pnpm vp run build` for `dist/`); `pnpm vp run @pipis/docs#site:test` builds it and uses it in Chromium. The site is plain files with relative links.
- Docs are code: `docs/` is the single source, every `live`/`check` block in it is compiled and every `live` one is run (`pnpm vp run @pipis/docs#docs`, see `docs/authoring.md`). `docs/reference/api.md` is generated: after changing an export or its doc comment run `node packages/pipis/tools/api.ts --out docs/reference/api.md`.
- The design assumptions are in `docs/adr/`. Size is measured and gated (`pnpm vp run pipis#size`); speed by `node packages/pipis/tools/bench.ts`. Say what a change costs, with numbers, in the commit.
- `packages/pipis/LLM.md` is written for models and is excluded from the formatter. A change to a public API can make it wrong: say so in the commit.
- Scratch files, screenshots and logs go under `out/` (ignored). Run `git status` before committing.
- The sandbox may not reach the network. Use what is in the repository and say so.
