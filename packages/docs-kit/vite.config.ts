// The documentation kit's tests and its checks. (The formatter and linter are the repository's: see the root vite.config.ts.)
import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    pool: 'forks',
    isolate: true,
    maxWorkers: process.env.CI ? 2 : undefined,
    retry: process.env.CI ? 1 : 0,
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    // Node tests: the kit reads Markdown and writes files, and has no DOM.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
  run: {
    tasks: {
      check: { command: 'tsc -p .' },
      test: { command: 'vp test run src/', cache: false },
      // The tarball a release publishes: built, unpacked, and its entry points loaded.
      'pack:test': { command: 'vp test run tools/pack.test.ts', cache: false },
    },
  },
});
