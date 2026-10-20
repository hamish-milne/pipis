# pipis

A small front-end framework for JSX, with no virtual DOM and no re-rendering. This repository holds the library, the documentation kit that builds its site, and the site.

| Path                                       | What it is                                                                                      | Published                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------- |
| [`packages/pipis`](packages/pipis)         | The library: reactive state, JSX components, server rendering, islands and hydration.           | `pipis`                    |
| [`packages/docs-kit`](packages/docs-kit)   | A Vite plugin that builds a documentation site from Markdown, with live, editable examples.     | `@pipis/docs-kit` (beta)   |
| [`apps/docs`](apps/docs)                   | The documentation site: [`docs/`](docs) built with the kit, as a pipis app.                     | no                         |
| [`docs/`](docs)                            | The documentation itself, as Markdown (it reads on GitHub as it does on the site).              |                            |

Start with the [library's README](packages/pipis/README.md). To work on the repository, see [CONTRIBUTING.md](CONTRIBUTING.md).

```sh
pnpm install
pnpm vp dev                          # the documentation site
pnpm vp run --concurrency-limit 2 all   # everything CI runs
```

MIT licensed, by Neofox Solutions LLP and Hamish Milne.
