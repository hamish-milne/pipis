// The examples of LLM.md, the reference that ships with the library for models to read. It is documentation, so it is checked with the rest of it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocBlock } from '@pipis/docs-kit/blocks';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The `tsx` examples of LLM.md, which a model copies, so they have to be code that compiles:
 *  - the complete examples (section 2, the quickstart, and section 6, the worked examples) are modules, compiled exactly as written;
 *  - the fragments of the API reference (section 7) are lines of an example that cannot stand alone, so each must be a line of
 *    packages/pipis/types/llm.check.tsx, which is compiled. Section 5's wrong-and-right pairs are covered there where the compiler has a view,
 *    and the rest of them are runtime behaviour that packages/pipis/src/*.test.ts tests.
 */
export function llmExamples(library: string): { modules: DocBlock[]; fragments: { line: number; text: string }[] } {
  const modules: DocBlock[] = [];
  const fragments: { line: number; text: string }[] = [];
  const lines = readFileSync(join(library, 'LLM.md'), 'utf8').split('\n');
  let section = 0;
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const h2 = /^## (\d+)\./.exec(line);
    if (h2) section = Number(h2[1]);
    const h3 = /^### (.+)$/.exec(line);
    if (h3) heading = h3[1] ?? '';
    if (!/^```tsx\s*$/.test(line)) continue;
    let end = i + 1;
    while (end < lines.length && !/^```\s*$/.test(lines[end] ?? '')) end++;
    const code = lines.slice(i + 1, end);
    if (section === 2 || section === 6) {
      const title = section === 2 ? 'Quickstart' : heading;
      modules.push({
        file: 'LLM.md',
        line: i + 1,
        kind: 'check',
        language: 'tsx',
        id: `llm-${slug(title)}`,
        title,
        height: null,
        width: null,
        isStatic: false,
        code: code.join('\n') + '\n',
      });
    } else if (section === 7) {
      code.forEach((text, k) => fragments.push({ line: i + 2 + k, text }));
    }
    i = end;
  }
  return { modules, fragments };
}

/** Code without its comments, quotes style, spacing and punctuation that a formatter changes: what is left is the order of the tokens. */
export function tokensOf(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/["'`]/g, "'")
    .replace(/[\s;,()]/g, '');
}
