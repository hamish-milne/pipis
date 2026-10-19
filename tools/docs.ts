// Reading the documentation's code blocks. The documentation is Markdown in `docs/`; a fenced block whose info string says `live` or
// `check` is a module that this repository compiles and (for `live`) runs. See docs/authoring.md for the format.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export type BlockKind = 'live' | 'check';

export interface DocBlock {
  /** The Markdown file, relative to the repository. */
  file: string;
  /** The line of the opening fence (1-based). */
  line: number;
  kind: BlockKind;
  language: 'ts' | 'tsx';
  /** Unique across the documentation: `id=` if given, else made from the title. */
  id: string;
  title: string;
  /** The preview's height in pixels (`live` only), or null to fit its content. */
  height: number | null;
  /** A fixed preview width in pixels, or null to fill the page. */
  width: number | null;
  /** `static`: the example needs no pointer or keyboard, so a site may show it as a picture. */
  isStatic: boolean;
  code: string;
}

const KEYS = new Set(['title', 'id', 'height', 'width']);
const FLAGS = new Set(['live', 'check', 'static']);

/** `tsx live title="A counter" height=120` as a language and its words. Throws on anything it does not know, so a typo is found. */
export function parseInfo(info: string, where: string): { language: string; flags: Set<string>; values: Map<string, string> } {
  const language = /^[A-Za-z0-9_+-]*/.exec(info)?.[0] ?? '';
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const rest = info.slice(language.length);
  const word = /\s+([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|(\S+)))?/y;
  let at = 0;
  while (at < rest.length) {
    word.lastIndex = at;
    const m = word.exec(rest);
    if (!m) {
      if (rest.slice(at).trim() === '') break;
      throw new Error(`${where}: cannot read the code block's info string near '${rest.slice(at).trim()}'`);
    }
    at = word.lastIndex;
    const name = m[1] ?? '';
    const value = m[2] ?? m[3];
    if (value === undefined) {
      if (!FLAGS.has(name)) throw new Error(`${where}: unknown flag '${name}' (flags: ${[...FLAGS].join(', ')})`);
      flags.add(name);
    } else {
      if (!KEYS.has(name)) throw new Error(`${where}: unknown key '${name}' (keys: ${[...KEYS].join(', ')})`);
      values.set(name, value);
    }
  }
  return { language, flags, values };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Every `live` and `check` block of one Markdown text. Other fences are skipped, but must still be closed. */
export function blocksOf(markdown: string, file: string): DocBlock[] {
  const out: DocBlock[] = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,})(.*)$/.exec(lines[i] ?? '');
    if (!open) continue;
    const indent = (open[1] ?? '').length;
    const fence = open[2] ?? '';
    const where = `${file}:${i + 1}`;
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^\\s*${fence}\`*\\s*$`).test(lines[end] ?? '')) end++;
    if (end >= lines.length) throw new Error(`${where}: this code block is never closed`);
    const info = (open[3] ?? '').trim();
    const { language, flags, values } = parseInfo(info, where);
    const kind: BlockKind | null = flags.has('live') ? 'live' : flags.has('check') ? 'check' : null;
    if (kind) {
      if (flags.has('live') && flags.has('check')) throw new Error(`${where}: a block is 'live' or 'check', not both`);
      if (language !== 'tsx' && language !== 'ts') throw new Error(`${where}: a ${kind} block is 'tsx' or 'ts', not '${language}'`);
      const title = values.get('title');
      if (!title) throw new Error(`${where}: a ${kind} block needs title="..."`);
      const pixels = (key: string): number | null => {
        const v = values.get(key);
        if (v === undefined) return null;
        if (!/^\d+$/.test(v)) throw new Error(`${where}: ${key} must be a whole number of pixels`);
        return Number(v);
      };
      out.push({
        file,
        line: i + 1,
        kind,
        language,
        title,
        id: values.get('id') ?? slug(title),
        height: pixels('height'),
        width: pixels('width'),
        isStatic: flags.has('static'),
        code:
          lines
            .slice(i + 1, end)
            .map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)))
            .join('\n') + '\n',
      });
    } else if (flags.size || values.size) {
      throw new Error(`${where}: '${info}' has docs words, but the block is not 'live' or 'check'`);
    }
    i = end;
  }
  return out;
}

/** Every Markdown file under `dir`, sorted. */
export function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path));
    else if (name.endsWith('.md')) out.push(path);
  }
  return out;
}

/** All blocks in the documentation, in file order, with ids checked unique. */
export function allBlocks(root: string, dir = join(root, 'docs')): DocBlock[] {
  const blocks = markdownFiles(dir).flatMap((f) => blocksOf(readFileSync(f, 'utf8'), relative(root, f)));
  const seen = new Map<string, DocBlock>();
  for (const b of blocks) {
    const before = seen.get(b.id);
    if (before)
      throw new Error(`${b.file}:${b.line}: example id '${b.id}' is also used at ${before.file}:${before.line}; give one an id="..."`);
    seen.set(b.id, b);
  }
  return blocks;
}

/** A heading's anchor, as GitHub makes it: lowercase, punctuation dropped, spaces to hyphens. */
export function anchorOf(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Every relative link in the documentation that goes nowhere: a missing file, or an anchor the page does not have. */
export function linkProblems(root: string, dir = join(root, 'docs')): string[] {
  const problems: string[] = [];
  const anchors = new Map<string, Set<string>>();
  const texts = new Map<string, string>();
  for (const f of markdownFiles(dir)) {
    const text = readFileSync(f, 'utf8');
    texts.set(f, text);
    const set = new Set<string>();
    let fenced = false;
    for (const line of text.split('\n')) {
      if (/^\s*`{3,}/.test(line)) {
        fenced = !fenced;
        continue;
      }
      const m = !fenced && /^#{1,6}\s+(.*)$/.exec(line);
      if (m) set.add(anchorOf(m[1] ?? ''));
    }
    anchors.set(f, set);
  }
  for (const [file, text] of texts) {
    let fenced = false;
    text.split('\n').forEach((line, i) => {
      if (/^\s*`{3,}/.test(line)) {
        fenced = !fenced;
        return;
      }
      if (fenced) return;
      for (const m of line.replace(/`[^`]*`/g, '').matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = m[1] ?? '';
        if (/^[a-z]+:/i.test(target)) continue;
        const [path = '', anchor] = target.split('#');
        const resolved = path === '' ? file : join(dirname(file), path);
        const where = `${relative(root, file)}:${i + 1}`;
        const known = anchors.get(resolved);
        // A file elsewhere in the repository (CONTRIBUTING, LLM.md) is fine as long as it is there; its headings are not checked.
        if (!known && existsSync(resolved)) continue;
        if (!known) {
          problems.push(`${where}: '${target}' is not a page of the documentation`);
        } else if (anchor && !known.has(anchor)) {
          problems.push(`${where}: '${target}' has no heading '${anchor}'`);
        }
      }
    });
  }
  return problems;
}

/**
 * The `tsx` examples of LLM.md, which a model copies, so they have to be code that compiles:
 *  - the complete examples (section 2, the quickstart, and section 6, the worked examples) are modules, compiled exactly as written;
 *  - the fragments of the API reference (section 7) are lines of an example that cannot stand alone, so each must be a line of
 *    src/types/llm.check.tsx, which is compiled. Section 5's wrong-and-right pairs are covered there where the compiler has a view,
 *    and the rest of them are runtime behaviour that src/pipis/*.test.ts tests.
 */
export function llmExamples(root: string): { modules: DocBlock[]; fragments: { line: number; text: string }[] } {
  const modules: DocBlock[] = [];
  const fragments: { line: number; text: string }[] = [];
  const lines = readFileSync(join(root, 'LLM.md'), 'utf8').split('\n');
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
