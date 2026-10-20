// The library's tests and its checks. (The formatter and linter are the repository's: see the root vite.config.ts.)
import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

// Tests that need `pipis` to be the server's, or the hydrating one: they run in their own projects.
const SERVER_ONLY = ['**/node_modules/**', '**/*.server.test.*', '**/*.hydrate.test.*'];

export default defineConfig({
  test: {
    // Each project says what it runs: an `include` here would be merged into both.
    // A fresh process per file, so a test that leaves a subscriber or a DOM node behind cannot colour the next one.
    pool: 'forks',
    isolate: true,
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'test/**'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
    },
    maxWorkers: process.env.CI ? 2 : undefined,
    retry: process.env.CI ? 1 : 0,
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    // The DOM tests run twice: in jsdom, which is fast, and in Chromium, which is what the library is for. A test that only
    // makes sense in a real browser (jsdom has no MathML, for one) checks `realBrowser` from `test/dom.ts` and skips itself.
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,mjs}'],
          exclude: SERVER_ONLY,
        },
      },
      // Server rendering is tested with `pipis` as the server's platform: the condition is what the bundler is given (docs/adr/0019).
      // No DOM: the server has none, and a test that reaches for `document` should fail.
      {
        extends: true,
        resolve: { conditions: ['pipis-server'] },
        ssr: { resolve: { conditions: ['pipis-server'] } },
        test: {
          name: 'server',
          environment: 'node',
          setupFiles: [],
          include: ['src/**/*.server.test.{ts,tsx}'],
        },
      },
      // Hydration is tested with `pipis` as the hydrating platform, in a DOM: the condition is what a browser's bundle is given (docs/adr/0021).
      {
        extends: true,
        resolve: { conditions: ['pipis-hydrate'] },
        test: {
          name: 'hydrate',
          environment: 'jsdom',
          include: ['src/**/*.hydrate.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: SERVER_ONLY,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              // Playwright's own download is not always available (a sandbox, for one); point this at any Chromium instead.
              launchOptions: process.env.PIPIS_CHROMIUM ? { executablePath: process.env.PIPIS_CHROMIUM } : {},
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
  run: {
    // The tasks of the library. Tasks that write files are not cached.
    tasks: {
      // Everything, then the library alone against the platform floor (ES2021 built-ins, no Node types).
      check: { command: ['tsc -p .', 'tsc -p tsconfig.lib.json'] },
      // The DOM tests run in jsdom and in Chromium (see `test.projects`); coverage is recorded on every run.
      test: { command: 'vp test run src/ --coverage', cache: false },
      // The import graph is held to its layers, so a feature cannot become a cost of everything.
      deps: { command: 'vp test run tools/deps.test.ts' },
      // The generated API reference is current, and every export is documented and placed.
      api: { command: 'vp test run tools/api.test.ts', cache: false },
      // The tarball a release publishes: built, installed into a clean project, type-checked there and run.
      'pack:test': { command: 'vp test run tools/pack.test.ts', cache: false },
      // What each feature costs an app, against the committed baseline. `size` prints the table.
      size: { command: 'node tools/size.ts', cache: false },
      'size:check': { command: 'node tools/size.ts --check', cache: false },
      // The server's markup is the browser build's: the same components rendered both ways and compared (tools/server.test.ts), and the same
      // components hydrated (tools/hydrate.test.ts).
      'server:test': { command: 'vp test run tools/server.test.ts tools/hydrate.test.ts', cache: false },
    },
  },
});
