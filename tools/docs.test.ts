import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vite-plus/test';
import { load, reference } from './api.ts';
import { bundle } from './bundle.ts';
import { allBlocks, anchorOf, blocksOf, linkProblems, llmExamples, parseInfo, tokensOf, type DocBlock } from './docs.ts';

// The documentation's code is real: every `live` and `check` block is type-checked against the library, and every `live` block is run in
// a DOM. A change that breaks the documented API breaks this test, naming the page and line.
//
//   pnpm vp run docs                       check everything
//   PIPIS_DOCS_SHEET=1 pnpm vp run docs    also write out/docs-sheet.html: every live example's markup, to look at
//   PIPIS_DOCS_LINKS=0 pnpm vp run docs    do not check that links resolve (while writing)

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out', 'docs-check');
const src = (name: string) => join(root, 'src/pipis', name);

describe('the reader of blocks', () => {
  it('reads the words of an info string, and refuses what it does not know', () => {
    const info = parseInfo('tsx live title="A counter" height=120 static', 'x');
    expect(info.language).toBe('tsx');
    expect([...info.flags]).toEqual(['live', 'static']);
    expect(info.values.get('title')).toBe('A counter');
    expect(info.values.get('height')).toBe('120');
    expect(() => parseInfo('tsx live titel="x"', 'x')).toThrow(/unknown key 'titel'/);
    expect(() => parseInfo('tsx lve', 'x')).toThrow(/unknown flag 'lve'/);
  });

  it('finds live and check blocks, and leaves the rest', () => {
    const markdown = [
      '# T',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '````tsx live title="One"',
      '```',
      'inner',
      '```',
      '````',
      '  ```tsx check title="Two words"',
      '  let b;',
      '  ```',
    ].join('\n');
    const found = blocksOf(markdown, 'x.md');
    expect(found.map((b) => [b.id, b.kind, b.line, b.height])).toEqual([
      ['one', 'live', 6, null],
      ['two-words', 'check', 11, null],
    ]);
    expect(found[0]?.code, 'a longer fence holds a shorter one').toBe('```\ninner\n```\n');
    expect(found[1]?.code, 'an indented block loses its indent').toBe('let b;\n');
  });

  it('refuses a block that is wrong, naming where', () => {
    expect(() => blocksOf('```tsx live\nx\n```\n', 'x.md')).toThrow(/needs title/);
    expect(() => blocksOf('```tsx live title="x"\nx\n', 'x.md')).toThrow(/never closed/);
    expect(() => blocksOf('```js live title="x"\nx\n```\n', 'x.md')).toThrow(/'tsx' or 'ts'/);
    expect(() => blocksOf('```ts static\nx\n```\n', 'x.md')).toThrow(/not 'live' or 'check'/);
    expect(() => blocksOf('```tsx live check title="x"\nx\n```\n', 'x.md')).toThrow(/not both/);
    expect(() => blocksOf('```tsx live title="x" height=tall\nx\n```\n', 'x.md')).toThrow(/whole number/);
  });

  it('makes anchors as GitHub does', () => {
    expect(anchorOf('Plot x/y pairs')).toBe('plot-xy-pairs');
    expect(anchorOf('The `Axis` class (1)')).toBe('the-axis-class-1');
  });
});

describe('the documentation', () => {
  it('has links that go somewhere', () => {
    const problems = process.env.PIPIS_DOCS_LINKS === '0' ? [] : linkProblems(root);
    expect(problems, `links that go nowhere:\n${problems.join('\n')}`).toEqual([]);
  });

  const llm = llmExamples(root);
  // The examples of LLM.md are compiled with the rest, so a model is never shown code that does not compile.
  const blocks = [...allBlocks(root), ...llm.modules];
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
        extends: '../../tsconfig.json',
        compilerOptions: {
          jsx: 'react-jsx',
          jsxImportSource: 'pipis',
          types: [],
          paths: {
            pipis: ['../../src/pipis/index.ts'],
            'pipis/jsx-runtime': ['../../src/pipis/jsx-runtime.ts'],
            'pipis/jsx-dev-runtime': ['../../src/pipis/jsx-dev-runtime.ts'],
            'pipis/server': ['../../src/pipis/server.ts'],
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
    const compiled = tokensOf(readFileSync(join(root, 'src/types/llm.check.tsx'), 'utf8'));
    const missing = llm.fragments
      // An import line is checked by what it imports: each name has to be one the compiled file imports.
      .filter(({ text }) => tokensOf(text).length > 2 && !/^\s*import/.test(text))
      .filter(({ text }) => !compiled.includes(tokensOf(text)))
      .map(({ line, text }) => `LLM.md:${line}: ${text.trim()}`);
    expect(missing, `these lines of LLM.md are not in src/types/llm.check.tsx, which is what tsc compiles:\n${missing.join('\n')}`).toEqual(
      [],
    );
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

describe('the API reference', () => {
  const generated = load();

  it('documents every export, and places it', () => {
    expect(generated.problems).toEqual([]);
  });

  it('is what the generator prints, so it cannot have drifted', () => {
    const file = readFileSync(join(root, 'docs/reference/api.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(file, 'docs/reference/api.md is stale: run `node tools/api.ts --out docs/reference/api.md`').toBe(
      reference(generated.declarations),
    );
  }, 60_000);
});
