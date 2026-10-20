import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vite-plus/test';
import { allBlocks, linkProblems, type DocBlock } from '@pipis/docs-kit/blocks';
import { bundle } from './bundle.ts';
import { llmExamples, tokensOf } from './llm.ts';

// The documentation's code is real: every `live` and `check` block is type-checked against the library, and every `live` block is run in
// a DOM. A change that breaks the documented API breaks this test, naming the page and line.
//
//   pnpm vp run docs                       check everything
//   PIPIS_DOCS_SHEET=1 pnpm vp run docs    also write out/docs-sheet.html: every live example's markup, to look at
//   PIPIS_DOCS_LINKS=0 pnpm vp run docs    do not check that links resolve (while writing)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The repository, which has the documentation (docs/), and the library, which has what the documentation documents: the library's source, and the LLM.md written for models.
const repo = resolve(root, '../..');
const library = dirname(createRequire(import.meta.url).resolve('pipis/package.json'));
const out = join(root, 'out', 'docs-check');
const src = (name: string) => join(library, 'src', name);

describe('the documentation', () => {
  it('has links that go somewhere', () => {
    const problems = process.env.PIPIS_DOCS_LINKS === '0' ? [] : linkProblems(repo);
    expect(problems, `links that go nowhere:\n${problems.join('\n')}`).toEqual([]);
  });

  const llm = llmExamples(library);
  // The examples of LLM.md are compiled with the rest, so a model is never shown code that does not compile.
  const blocks = [...allBlocks(repo), ...llm.modules];
  const live = blocks.filter((b) => b.kind === 'live');
  const sheet: { block: DocBlock; html: string }[] = [];

  it('has examples', () => {
    expect(llm.modules.length, 'the quickstart and the worked examples of LLM.md').toBeGreaterThanOrEqual(4);
    expect(live.length).toBeGreaterThan(10);
    expect(blocks.length).toBeGreaterThan(live.length);
  });

  it('compiles every live and check block against the library', () => {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    for (const b of blocks) writeFileSync(join(out, `${b.id}.${b.language}`), b.code);
    writeFileSync(
      join(out, 'tsconfig.json'),
      JSON.stringify({
        extends: join(repo, 'tsconfig.base.json'),
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'pipis',
          types: [],
          paths: {
            pipis: [src('index.ts')],
            'pipis/jsx-runtime': [src('jsx-runtime.ts')],
            'pipis/jsx-dev-runtime': [src('jsx-dev-runtime.ts')],
            'pipis/server': [src('server.ts')],
            'pipis/islands': [src('islands.ts')],
            'pipis/hydrate': [src('hydrate.ts')],
          },
        },
        include: ['*.ts', '*.tsx'],
      }),
    );
    const tsc = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', out, '--pretty', 'false'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (tsc.status !== 0) {
      const byId = new Map(blocks.map((b) => [b.id, b]));
      const text = (tsc.stdout + tsc.stderr)
        .split('\n')
        .map((l) => {
          const m = /^(?:out[\\/]docs-check[\\/])?([\w-]+)\.tsx?\((\d+),(\d+)\): (.*)$/.exec(l);
          const b = m && byId.get(m[1] ?? '');
          // The code starts on the line after the fence.
          return b && m ? `${b.file}:${b.line + Number(m[2])}:${m[3]}  [${b.id}] ${m[4]}` : l;
        })
        .join('\n');
      expect.fail(`documentation code does not compile:\n${text}`);
    }
  }, 120_000);

  it('has every line of the API reference examples of LLM.md in the compiled snippets', () => {
    const compiled = tokensOf(readFileSync(join(library, 'types/llm.check.tsx'), 'utf8'));
    const missing = llm.fragments
      // An import line is checked by what it imports: each name has to be one the compiled file imports.
      .filter(({ text }) => tokensOf(text).length > 2 && !/^\s*import/.test(text))
      .filter(({ text }) => !compiled.includes(tokensOf(text)))
      .map(({ line, text }) => `LLM.md:${line}: ${text.trim()}`);
    expect(
      missing,
      `these lines of LLM.md are not in packages/pipis/types/llm.check.tsx, which is what tsc compiles:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('gives every live example a module that imports only pipis and is deterministic', () => {
    for (const b of live) {
      const where = `${b.file}:${b.line} [${b.id}]`;
      for (const m of b.code.matchAll(/\bfrom\s*(['"])([^'"]+)\1/g)) {
        expect(m[2], `${where}: a live example imports only from 'pipis'`).toBe('pipis');
      }
      expect(b.code, `${where}: a live example has a default export`).toMatch(/^export default\b/m);
      expect(b.code, `${where}: a live example is deterministic`).not.toMatch(/Math\.random|Date\.now|new Date\(|\bfetch\(|XMLHttpRequest/);
    }
  });

  it.each(live.map((b) => [b.id, b] as const))(
    'runs the live example "%s": it mounts, shows something, and unmounts cleanly',
    async (_id, b) => {
      const where = `${b.file}:${b.line} [${b.id}]`;
      const code = await bundle({
        contents: `import example from 'example'; export const run = example;`,
        alias: {
          example: join(out, `${b.id}.${b.language}`),
          pipis: src('index.ts'),
          'pipis/jsx-runtime': src('jsx-runtime.ts'),
          'pipis/jsx-dev-runtime': src('jsx-dev-runtime.ts'),
        },
        jsxImportSource: 'pipis',
      }).catch((e: Error) => expect.fail(`${where}: does not bundle: ${e.message}`));
      const file = join(out, `${b.id}.run.mjs`);
      writeFileSync(file, code);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      // The examples log to show what happens; the test only needs that they run.
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const mod: { run: unknown } = await import(/* @vite-ignore */ pathToFileURL(file).href);
        expect(typeof mod.run, `${where}: the default export must be a function`).toBe('function');
        const element = typeof mod.run === 'function' ? mod.run() : undefined;
        expect(typeof element, `${where}: the default export must return an element, a function`).toBe('function');
        if (typeof element !== 'function') return;
        const container = document.createElement('div');
        document.body.append(container);
        element(container);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(container.childNodes.length, `${where}: nothing was rendered`).toBeGreaterThan(0);
        const text = container.textContent ?? '';
        for (const bad of ['NaN', 'undefined', '[object Object]']) expect(text, `${where}: shows "${bad}"`).not.toContain(bad);
        sheet.push({ block: b, html: container.innerHTML });
        element();
        expect(container.childNodes.length, `${where}: left nodes behind after unmounting`).toBe(0);
        container.remove();
        expect(errors, `${where}: reported an error`).not.toHaveBeenCalled();
      } finally {
        errors.mockRestore();
        log.mockRestore();
      }
    },
  );

  afterAll(() => {
    if (!process.env.PIPIS_DOCS_SHEET) return;
    const body = sheet
      .map(
        ({ block, html }) =>
          `<section><h2>${block.title} <small>${block.file}:${block.line}</small></h2><div class="example">${html}</div></section>`,
      )
      .join('\n');
    writeFileSync(join(root, 'out', 'docs-sheet.html'), `<!doctype html><meta charset="utf-8"><title>pipis examples</title>\n${body}\n`);
  });
});
