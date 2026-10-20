// The documentation site: `vp dev` serves it (and reloads on a change), `vp build` writes it into dist/ (src/vite-plugin.ts). Its tests are here too.
import { defineConfig } from 'vite-plus';
import { docsSite } from './src/vite-plugin.ts';

export default defineConfig({
  plugins: [docsSite({ render: 'islands', pages: 'separate' })],
  test: {
    pool: 'forks',
    isolate: true,
    maxWorkers: process.env.CI ? 2 : undefined,
    retry: process.env.CI ? 1 : 0,
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    projects: [
      // The documentation's code is compiled, every live example is run, and (against the library's server and hydrating builds, which the
      // tests make themselves) compared: these need a DOM.
      {
        extends: true,
        test: {
          name: 'docs',
          environment: 'jsdom',
          include: ['tests/docs.test.ts', 'tests/server.docs.test.ts', 'tests/hydrate.docs.test.ts'],
        },
      },
      // The Markdown component, run as the server's build of pipis runs it when the site is built: no DOM.
      {
        extends: true,
        resolve: { conditions: ['pipis-server'] },
        ssr: { resolve: { conditions: ['pipis-server'] } },
        test: {
          name: 'markdown',
          environment: 'node',
          include: ['tests/*.server.test.tsx'],
        },
      },
      // The site, built under a path of its own and used in Chromium (the test starts its own).
      {
        extends: true,
        test: {
          name: 'site',
          environment: 'node',
          include: ['tests/site.test.ts'],
        },
      },
    ],
  },
  run: {
    tasks: {
      check: { command: 'tsc -p .' },
      // The documentation's code is compiled, every live example is run, and links are followed.
      docs: { command: 'vp test run tests/docs.test.ts tests/server.docs.test.ts tests/hydrate.docs.test.ts', cache: false },
      // The documentation site, into dist/. `node src/serve.ts` serves it, and `vp dev` serves it with reloading.
      build: { command: 'vp build', cache: false },
      // The site is built under a path of its own and used in Chromium: every page opened, every example run, one edited, the search used.
      // And the Markdown component, rendered as a server renders it, over every page of the docs.
      'site:test': { command: 'vp test run tests/site.test.ts tests/markdown.server.test.tsx', cache: false },
    },
  },
});
