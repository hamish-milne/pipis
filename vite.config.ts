// One configuration for the toolchain (Vite+): the site build, the task runner, and Oxlint's and Oxfmt's settings.
import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    modulePreload: false,
    rollupOptions: {
      input: {
        main: 'index.html',
        docs: 'docs.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,mjs}'],
    // A fresh process per file, so a test that leaves a subscriber or a DOM node behind cannot colour the next one.
    pool: 'forks',
    isolate: true,
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/pipis/**/*.{ts,tsx}'],
      // The docs site's markdown and highlighting helpers sit beside the library but are not part of it.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/pipis/markdown.tsx', 'src/pipis/highlight.tsx'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
    },
    maxWorkers: process.env.CI ? 2 : undefined,
    retry: process.env.CI ? 1 : 0,
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
    // The DOM tests run twice: in jsdom, which is fast, and in Chromium, which is what the library is for. A test that only
    // makes sense in a real browser (jsdom has no MathML, for one) checks `realBrowser` from `src/test/dom.ts` and skips itself.
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.{ts,mjs}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'chromium',
          include: ['src/**/*.test.{ts,tsx}'],
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
    // `vp run all` is everything CI runs. Tasks that write files are not cached.
    tasks: {
      check: { command: 'tsc -p .' },
      lint: { command: 'vp lint --deny-warnings --report-unused-disable-directives' },
      fmt: { command: 'vp fmt', cache: false },
      'fmt:check': { command: 'vp fmt --check' },
      // The DOM tests run in jsdom and in Chromium (see `test.projects`); coverage is recorded on every run.
      test: { command: 'vp test run --coverage', cache: false },
      actions: { command: 'node tools/actions.ts check' },
      build: { command: 'vp build', cache: false },
      all: {
        command: 'echo all green',
        cache: false,
        dependsOn: ['check', 'lint', 'fmt:check', 'test', 'actions', 'build'],
      },
    },
  },
  fmt: {
    printWidth: 140,
    singleQuote: true,
    ignorePatterns: [
      'dist/**',
      'out/**',
      'coverage/**',
      'node_modules/**',
      'pnpm-lock.yaml',
      // LLM.md is written for models, with hand-aligned tables that the formatter would reflow.
      'LLM.md',
      '**/*.md',
      '**/*.json',
      '**/*.yml',
      '**/*.yaml',
      '**/*.html',
      '**/*.css',
    ],
  },
  lint: {
    options: { typeAware: true },
    plugins: ['typescript', 'unicorn', 'oxc'],
    categories: {
      correctness: 'error',
      suspicious: 'warn',
    },
    ignorePatterns: ['dist/**', 'out/**', 'coverage/**', 'node_modules/**'],
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
        },
      ],
      'typescript/no-non-null-assertion': 'error',
      'eslint/no-shadow': 'off',
      'eslint/no-underscore-dangle': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-array-sort': 'off',
      // Casts are audited on their own (Phase 3); a second rule would only repeat the audit.
      'typescript/no-unsafe-type-assertion': 'off',
      'typescript/consistent-return': 'off',
      'typescript/no-unnecessary-type-parameters': 'off',
    },
    overrides: [
      {
        files: ['src/**', 'tools/**', '*.ts'],
        env: { browser: true, node: true, es2022: true },
      },
    ],
  },
});
