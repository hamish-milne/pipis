# Instructions for AI agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing anything, and [RUNBOOKS.md](RUNBOOKS.md) for chores such as updating dependencies or actions.

The short version:

- `pnpm vp run --concurrency-limit 2 all` is the definition of green. Read its output: a lint warning or a skipped task is not green.
- A bug fix starts with a test that fails without it. A change to documented behaviour changes the docs in the same commit.
- No new dependencies, and no `any`, `@ts-ignore` or `!` to get past a check. Fix the type, or opt out with a comment that gives the reason.
- `LLM.md` is written for models and is excluded from the formatter. A change to a public API can make it wrong: say so in the commit.
- Scratch files, screenshots and logs go under `out/` (ignored). Run `git status` before committing.
- The sandbox may not reach the network. Use what is in the repository and say so.
