// The toolchain's settings for the whole repository (Vite+): the formatter and the linter, and the tasks that run every package's own. Each package has a
// vite.config.ts of its own for what is particular to it (tests, builds), and its own tasks; `all` is what CI runs.
import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    // `vp run all` is everything CI runs: the repository's checks, and each package's. Tasks that write files are not cached.
    tasks: {
      lint: { command: 'vp lint --deny-warnings --report-unused-disable-directives' },
      fmt: { command: 'vp fmt', cache: false },
      'fmt:check': { command: 'vp fmt --check' },
      actions: { command: 'node tools/actions.ts check' },
      all: {
        command: 'echo all green',
        cache: false,
        dependsOn: [
          'lint',
          'fmt:check',
          'actions',
          'pipis#check',
          'pipis#test',
          'pipis#deps',
          'pipis#api',
          'pipis#size:check',
          'pipis#pack:test',
          'pipis#server:test',
          '@pipis/docs-kit#check',
          '@pipis/docs-kit#test',
          '@pipis/docs-kit#pack:test',
          '@pipis/docs#check',
          '@pipis/docs#docs',
          '@pipis/docs#build',
          '@pipis/docs#site:test',
        ],
      },
    },
  },
  fmt: {
    printWidth: 140,
    singleQuote: true,
    ignorePatterns: [
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/node_modules/**',
      'pnpm-lock.yaml',
      // Written by packages/pipis/tools/reflect.ts from jsdom.
      'packages/pipis/src/reflect.ts',
      // LLM.md is written for models, with hand-aligned tables that the formatter would reflow.
      'packages/pipis/LLM.md',
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
    ignorePatterns: ['**/dist/**', '**/out/**', '**/coverage/**', '**/node_modules/**'],
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
      'unicorn/no-array-reverse': 'off',
      // Casts are audited on their own; a second rule would only repeat the audit.
      'typescript/no-unsafe-type-assertion': 'off',
      'typescript/consistent-return': 'off',
      'typescript/no-unnecessary-type-parameters': 'off',
    },
    // The platform the library may assume (docs/adr/0016-platform-floor.md): no API newer than Baseline 2015 in what ships.
    jsPlugins: ['eslint-plugin-baseline-js'],
    overrides: [
      // No `env` for the library itself: with globals declared, the Baseline rule takes `Object` and `Map` for the program's own names
      // and sees nothing. TypeScript knows the library's globals; everything else is given them here.
      {
        files: [
          'packages/pipis/test/**',
          'packages/pipis/src/*.test.ts',
          'packages/pipis/src/*.test.tsx',
          'packages/pipis/tools/**',
          'packages/docs-kit/**',
          'apps/docs/**',
          'tools/**',
          '**/*.config.ts',
        ],
        env: { browser: true, node: true, es2022: true },
      },
      {
        files: ['packages/pipis/src/*.ts'],
        rules: {
          'baseline-js/use-baseline': [
            'error',
            {
              available: 2015,
              includeWebApis: { preset: 'auto' },
              includeJsBuiltins: { preset: 'auto' },
              // The floor is for the APIs the library calls, which an app cannot lower. Syntax can be lowered by the app's bundler, so the
              // syntax the library is written in is listed here, on purpose; newer syntax the rule recognises, and is not listed, fails.
              ignoreFeatures: [
                'let-const',
                'template-literals',
                'class-syntax',
                'destructuring',
                'spread',
                'nullish-coalescing',
                'logical-assignments',
              ],
            },
          ],
          // A cast is a claim the compiler cannot check, so each one in the library is owned in writing: a comment that gives the reason.
          'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
        },
      },
      {
        files: ['packages/pipis/src/*.test.ts'],
        rules: { 'baseline-js/use-baseline': 'off', 'typescript/consistent-type-assertions': 'off' },
      },
    ],
  },
});
