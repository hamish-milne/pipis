# Runbooks

Step-by-step procedures for the chores that come round. Each says what to run and how to know it worked. The rules for ordinary changes are in [CONTRIBUTING.md](CONTRIBUTING.md); read that first.

**"Green"** always means `pnpm vp run --concurrency-limit 2 all` passes with nothing skipped and no lint warnings. Read the output; do not trust the exit code alone.

- [Update dependencies](#update-dependencies)
- [Update the GitHub Actions](#update-the-github-actions)
- [Update the toolchain](#update-the-toolchain)
- [Change the size baseline](#change-the-size-baseline)
- [Run the benchmark](#run-the-benchmark)
- [Change the Node version the repository uses](#change-the-node-version-the-repository-uses)
- [Investigate a failure that only happens in CI](#investigate-a-failure-that-only-happens-in-ci)

Release, size-baseline and platform-floor runbooks are added in the phases that introduce those checks.

## Update dependencies

The library has no runtime dependencies; this is about the tooling and the docs site. Versions live in the **`catalog:`** in `pnpm-workspace.yaml`, and `package.json` refers to them.

1. See what is old: `pnpm outdated`.
2. Update in small groups (the type packages together, the site packages together) by editing the catalog entry, then `pnpm install`.
3. `pnpm vp run --concurrency-limit 2 all`.
4. Read the changelog of anything with a major bump. Things that have bitten: a TypeScript release that changes built-in types; a linter or formatter release that adds rules or reflows code (see below).
5. Commit `pnpm-workspace.yaml` and `pnpm-lock.yaml` together, with the reason (`Update Rolldown to 1.3`). One commit per group keeps a regression easy to bisect.

pnpm refuses to install a package version younger than its minimum release age, as a defence against compromised releases. `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` lists the exact versions taken early on purpose (the Vite+ and Rolldown binaries). Do not add to it casually; remove entries when the versions are old enough to pass on their own.

## Update the GitHub Actions

Every `uses:` in `.github/workflows` names a full commit hash with the release in a comment (`actions/checkout@3d3c42e… # v7.0.1`), because a tag can be moved by whoever holds the action's repository and a commit cannot. `node tools/actions.ts check` (part of `all`) fails on any that is not pinned. Dependabot's weekly `github-actions` pull requests move the hash and the comment together; the same can be done by hand:

1. `node tools/actions.ts update` moves every action to the newest release of the major version it is on and prints what changed (`--major` goes to the newest release of all; read that action's release notes first). It uses `git ls-remote`, so it needs the network but no token.
2. Review `git diff .github`. For an action that holds a token (`davelosert/vitest-coverage-report-action` has `pull-requests: write`), read what the new release changed before taking it.
3. `node tools/actions.ts check`, commit (`Update GitHub Actions`), push, and look at the CI run: the first run is the test.
4. To add an action: write `uses: owner/repo@v1` as usual, run `node tools/actions.ts pin` and commit; `node tools/actions.ts list` shows what is used.

## Update the toolchain

- **Formatter (`oxfmt`) or linter (`oxlint` via Vite+):** bump it, run `pnpm vp fmt`, and commit the reformatting **by itself**. Add that commit's full hash to `.git-blame-ignore-revs`. If the new linter reports new things, fix them in separate commits, or add a rule override in `vite.config.ts` with a comment saying why. A rule change can make an old opt-out unused, which fails the build.
- **TypeScript:** run `pnpm vp run check`.
- **Vite+/Vitest:** run the whole suite; the test config is in `vite.config.ts`.

## Change the size baseline

`pnpm vp run size:check` (part of `all`) fails when a scenario's gzip size in `node tools/size.ts` is more than 2% and 16 bytes over
`tools/size-baseline.json`. The core is what every user pays for, so growth there is never a side effect. When a size change is meant (a
feature, or a dependency of it, that is worth its bytes):

1. `node tools/size.ts` to see the table, and say in the commit message what the change costs and why it is worth it.
2. `node tools/size.ts --update` writes the new baseline. Commit it with the change that moved it, so the diff of the baseline is the review of the cost.
3. A decrease is worth recording too: run `--update` after a win, so the next growth is measured against it.
4. If the README, `docs/adr/0015-size.md` or the introduction quote a size, update them from the same table.

A scenario that is added or renamed needs a baseline entry (the check says so), and one that is removed has to leave the baseline.

## Run the benchmark

`node tools/bench.ts` runs the operations an app does most in real Chromium and prints a table (median of 9 runs after 2 warm-ups). Set
`PIPIS_CHROMIUM` to use your own Chromium. The numbers depend on the machine and other load, so compare two runs made back to back on the
same machine, not against a number in a document. For a change to a hot path, run it before and after and put both tables in the commit
message. A new operation worth watching goes in `tools/bench-app.ts`.

## Change the Node version the repository uses

This is the version that runs the _tooling_, not anything the library needs. Development runs on Node 24 or later; CI runs Node 26.

1. `engines.node` in `package.json`, and `node-version` in `.github/workflows/ci.yml`.
2. Run the whole suite on the new version and read any new warnings.
3. Green, then push and check CI.

## Investigate a failure that only happens in CI

1. Read the first failure in the log, not the loudest: a task that fails fast can kill its siblings (exit 137).
2. Reproduce with the CI settings: `CI=true pnpm vp run --concurrency-limit 2 all`. CI retries a failed test once and runs two test workers.
3. Run the failing test alone, then against the unmodified code, before blaming the change.
4. Compare versions: CI runs Node 26 and `pnpm install --frozen-lockfile`.
5. A test that fails only in `chromium` or only in `jsdom` is usually a real difference between the two DOMs: run it alone with `pnpm vp test run --project chromium <file>`. If Playwright's Chromium will not launch, set `PIPIS_CHROMIUM` to a Chromium you have.
