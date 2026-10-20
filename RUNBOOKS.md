# Runbooks

Step-by-step procedures for the chores that come round. Each says what to run and how to know it worked. The rules for ordinary changes are in [CONTRIBUTING.md](CONTRIBUTING.md); read that first.

**"Green"** always means `pnpm vp run --concurrency-limit 2 all` passes with nothing skipped and no lint warnings. Read the output; do not trust the exit code alone.

- [What's in the package](#whats-in-the-package)
- [Release a new version](#release-a-new-version)
- [One-time release setup](#one-time-release-setup)
- [Regenerate the generated docs](#regenerate-the-generated-docs)
- [Update dependencies](#update-dependencies)
- [Update the GitHub Actions](#update-the-github-actions)
- [Update the toolchain](#update-the-toolchain)
- [Change the size baseline](#change-the-size-baseline)
- [Run the benchmark](#run-the-benchmark)
- [Move the platform floor](#move-the-platform-floor)
- [Change the Node version the repository uses](#change-the-node-version-the-repository-uses)
- [Investigate a failure that only happens in CI](#investigate-a-failure-that-only-happens-in-ci)

## What's in the package

One package, **`pipis`**, built by `tools/pack.ts`.

- **One version.** It is `version` in the **root `package.json`**, and nowhere else. The packer writes it into the published manifest.
- **The JavaScript is the source with its types blanked out,** not a compiler's re-emission. `tools/strip-types.ts` uses Node's own type stripping (`module.stripTypeScriptTypes`), which replaces every type with whitespace, so **each line is where it is in `src/pipis/`**. A stack trace from an installed `pipis` names the line to open in the repository. The only edit is `.ts` to `.js` in relative import paths, which is the same length. This is why the code is limited to erasable TypeScript (no `enum`, no `namespace`, no parameter properties), and `tools/pack.test.ts` checks that each `dist/*.js` has the line count of its source.
- **The declarations (`.d.ts`) come from `tsc`** (`tsconfig.types.json`, declaration-only), with relative imports written `./x.js`.
- **Three entry points:** `pipis`, `pipis/jsx-runtime`, `pipis/jsx-dev-runtime`. `LLM.md`, `README.md` and `LICENSE` are in the tarball. The documentation site (`docs-kit/`, `site/`) is not.
- Nothing is bundled or minified: an app bundles the library, and the files should read like the source.
- `engines` is deliberately not copied to the published manifest: the root's Node requirement is for the repository's tooling.

To look at what would be published: `node tools/pack.ts out/package` (prints the tarball path; `out/` is ignored by git), then `tar -tzf <tarball>`.

## Release a new version

Releases are made by publishing a **GitHub release**; the workflow in `.github/workflows/publish.yml` does the rest. Nothing goes live on npm until a maintainer approves it.

1. **Decide the version** (semver: a prerelease is `0.1.0-beta.1`, a release `1.0.0`). Breaking changes since the last release need a major (or, before 1.0, a note that says so).
2. **Make `main` green.** `git pull --rebase`, then `pnpm vp run --concurrency-limit 2 all`, and check the latest `ci.yml` run on GitHub is green too. For a release that changes performance-sensitive code, run `node tools/bench.ts` and compare with the last release (the tables go in the release notes).
3. **Check the numbers the docs quote** against `node tools/size.ts` (the README and the introduction quote sizes; `docs/adr/0015-size.md` has the table).
4. **Bump the version** in the root `package.json` only. Look for prose that names the previous version: `git grep -n "<old version>"`. Commit it as its own commit (`Release 0.1.0-beta.2`) and push.
5. **Create the release** on GitHub: tag **`v<version>`** exactly (`v0.1.0-beta.2`), target `main`, "Generate release notes", and tick **"Set as a pre-release"** for a prerelease. Publishing it starts the workflow.
6. **The workflow** (`Publish`):
   - `verify` (read-only token) fails if the tag is not `v` + the root `package.json` version or the tagged commit is not on `main`, runs the whole of `all`, and builds what is published. Only this job runs the repository's code.
   - `publish` downloads that folder (no checkout, no install) and **stages** it with `npm stage publish`. The npm dist-tag comes from the version: `0.1.0-beta.2` goes under `beta`, a plain `1.0.0` under `latest`; any other prerelease name becomes its own tag (`rc`, ...).
   - `assets` downloads the same build and attaches the tarball (`pipis-<version>.tgz`) to the release.
7. **Approve the staged version** (this asks for your 2FA): on npmjs.com under *Staged packages*, or `npm stage list pipis`, `npm stage approve <stage-id>`.
8. **Check what is live:**
   ```sh
   npm view pipis version dist-tags
   ```
   If the `latest` dist-tag is missing or wrong (npm does not move `latest` for a prerelease published under another tag, so the first release may leave it unset), set it: `npm dist-tag add pipis@<version> latest`, or leave `latest` alone on purpose while only betas exist. Then install it in a scratch project with `jsxImportSource: pipis` and build a counter.
9. **Tidy up:** announce, and close the milestone or issues the release finishes.

**If the workflow fails before staging,** fix `main`, delete the GitHub release *and* its tag (`git push --delete origin v<version>`), and make the release again; a version that was staged but not approved can be discarded on npmjs.com. **If a bad version was approved and went live,** npm versions cannot be reused: publish the next patch version, and `npm deprecate pipis@<bad> "reason, use <good>"`.

## One-time release setup

Done once per repository; keep as a checklist for a fork or a renamed package.

- **GitHub:** an environment named `npm` (Settings, Environments), with required reviewers (recommended: they are the second gate beside npm's approval); `publish.yml` runs its publish job in it.
- **npm:** the package exists (npm only lets you configure trusted publishing on a package that exists; `node tools/publish-placeholder.ts` publishes an empty placeholder for that, and can be deleted once it has been used). On the package's settings page add a **trusted publisher**: this GitHub repository, workflow `publish.yml`, environment `npm`, with `npm stage publish` allowed. There is no npm token anywhere; authentication is OIDC.
- The maintainers who approve staged packages have 2FA on their npm accounts.
- The repository is at its final address before the trusted publisher is configured: it is tied to the repository, so a move needs it done again.

## Regenerate the generated docs

`docs/reference/api.md` is generated from the library's declarations and doc comments. When an export, its signature or its doc comment changes, or one is added:

```sh
node tools/api.ts --out docs/reference/api.md   # regenerate the reference
pnpm vp run docs                                # compiles and runs every example, and checks the reference is current
```

Do not edit the reference by hand. A new export must be placed in `STRUCTURE` in `tools/api.ts` (the generator names what is missing) and must have a doc comment whose first sentence stands alone. `PIPIS_DOCS_SHEET=1 pnpm vp run docs` also writes `out/docs-sheet.html` with every live example's markup on one page, for looking at.

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
- **TypeScript:** run `pnpm vp run check` (it also runs `tsconfig.lib.json`, the library against the platform floor), then `pnpm vp run pack:test`: declaration emit is the part of TypeScript 7 that is still marked experimental, and the pack test type-checks the emitted declarations in a clean project.
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

## Move the platform floor

The library's floor is **ES2015 for APIs** ([ADR 16](docs/adr/0016-platform-floor.md)): the built-ins and DOM calls its users' browsers must have. ES2015 is the lowest it can be (the library needs `Map`, `Set` and `Symbol`), so moving it means raising it, which is a breaking change for users: do it for a reason (a feature that needs a newer API) and in a major release or with a loud note. The syntax the library is written in is separate, and is the list `ignoreFeatures` in `vite.config.ts`.

1. Change the year in the `baseline-js/use-baseline` rule in `vite.config.ts`, and the `lib` in `tsconfig.lib.json` (`es2015` to the new level).
2. Run `pnpm vp run check` and `pnpm vp lint`: they name every place that can now use a newer API. A newer API behind feature detection keeps a lint comment that says so.
3. To add a kind of syntax (the rule reported it), add its feature id to `ignoreFeatures` and say in the commit why it is worth asking apps to lower.
4. Update `docs/adr/0016-platform-floor.md`, `LLM.md` (the sentence about what pipis needs), the README if it states a floor, and the comment in `tsconfig.lib.json`.
5. `pnpm vp run --concurrency-limit 2 all`.

## Change the Node version the repository uses

This is the version that runs the _tooling_, not anything the library needs. Development runs on Node 24 or later; CI runs Node 26.

1. `engines.node` in `package.json`, and `node-version` in **both** workflows (`.github/workflows/ci.yml` once, `publish.yml` twice: grep `node-version`).
2. The tools use Node's built-in type stripping (`tools/*.ts` run directly, and `module.stripTypeScriptTypes` builds the package), which is experimental and changes between releases. Run the whole suite, `node tools/pack.ts out/package` and `pnpm vp run pack:test` on the new version, and read any new warnings.
3. Green, then push and check CI.

## Investigate a failure that only happens in CI

1. Read the first failure in the log, not the loudest: a task that fails fast can kill its siblings (exit 137).
2. Reproduce with the CI settings: `CI=true pnpm vp run --concurrency-limit 2 all`. CI retries a failed test once and runs two test workers.
3. Run the failing test alone, then against the unmodified code, before blaming the change.
4. Compare versions: CI runs Node 26 and `pnpm install --frozen-lockfile`.
5. A test that fails only in `chromium` or only in `jsdom` is usually a real difference between the two DOMs: run it alone with `pnpm vp test run --project chromium <file>`. If Playwright's Chromium will not launch, set `PIPIS_CHROMIUM` to a Chromium you have.
