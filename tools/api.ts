// The API reference, generated from the library's own declarations and doc comments so that it cannot drift: every export of every
// entry point, with its signature and what its comment says.
//   node tools/api.ts                    prints docs/reference/api.md
//   node tools/api.ts --out <file>       writes it
// tools/docs.test.ts checks that docs/reference/api.md matches what this prints, and that every export is documented and placed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export type Kind = 'function' | 'const' | 'type' | 'interface' | 'class';

export interface Declaration {
  name: string;
  kind: Kind;
  /** The doc comment as Markdown, empty if there is none. */
  doc: string;
  /** The declaration as the compiler prints it, without `export` and `declare`. */
  code: string;
  /** What to import it from. */
  from: string;
}

/** Where each public module is imported from. The names a module re-exports from another are listed once, under the module that has them. */
const ENTRY: Record<string, string> = {
  base: 'pipis',
  'platform.client': 'pipis',
  core: 'pipis',
  reactive: 'pipis',
  dynamic: 'pipis',
  'jsx-runtime': 'pipis/jsx-runtime',
  'jsx-dev-runtime': 'pipis/jsx-dev-runtime',
  serialize: 'pipis/server',
  server: 'pipis/server',
  islands: 'pipis/islands',
};

/** How the reference is laid out. Hand-written because the order and the introductions are editorial; checked to cover every export. */
export const STRUCTURE: { title: string; about: string; names: string[] }[] = [
  {
    title: 'State',
    about: 'Reactive values: something that holds a value and tells its subscribers when it changes, and ways to derive one from another.',
    names: [
      'reactive',
      'ReactiveState',
      'ReactiveReadonly',
      'Reactive',
      'MaybeReactive',
      'Cleanup',
      'REACTIVE',
      'isReactive',
      'subscribe',
      'select',
      'constant',
      'patch',
      'DeepPartial',
      'adapt',
    ],
  },
  {
    title: 'Elements',
    about: 'What JSX makes, and the pieces for making your own.',
    names: [
      'JSXElement',
      'JSXChild',
      'JSXChildArray',
      'JSXParent',
      'JSXSibling',
      'Content',
      'ChildrenProp',
      'RefProp',
      'CoreIntrinsicElements',
      'createElement',
      'Fragment',
      'emptyElement',
      'textNode',
      'createMarker',
      'moveNode',
      'setRef',
    ],
  },
  {
    title: 'Structure',
    about: 'Elements whose content changes shape: showing, choosing, listing and rebuilding.',
    names: ['If', 'OneOf', 'List', 'ReactiveList', 'Dynamic', 'dynamic'],
  },
  {
    title: 'Effects',
    about: 'Running code when an element is mounted and unmounted, or when a value changes.',
    names: ['effect', 'Effect', 'Watch'],
  },
  {
    title: 'Async and errors',
    about: 'Loading data, catching errors, and the context that carries the error handler.',
    names: [
      'Suspense',
      'ErrorBoundary',
      'ErrorHandler',
      'withErrorHandler',
      'getErrorHandler',
      'handleError',
      'subscribeWithCatch',
      'defineContext',
    ],
  },
  {
    title: 'Portals and the document head',
    about: 'Rendering somewhere else in the document.',
    names: ['PortalTargetValue', 'PortalTarget', 'Portal', 'Helmet'],
  },
  {
    title: 'Platform and server rendering',
    about:
      'What `pipis` runs on. By default it is a browser; a bundler can be told it is a server (the `pipis-server` condition), and then an element can be rendered to HTML. See the [guide to server rendering](../guide/server-rendering.md).',
    names: ['IS_CLIENT', 'renderToString', 'RenderResult', 'serializeData'],
  },
  {
    title: 'Islands',
    about:
      'Interactive components in a page that is made on a server, mounted in the browser over what the server wrote. Imported from `pipis/islands`. See the [guide to islands](../guide/islands.md).',
    names: ['Island', 'mountIslands'],
  },
  {
    title: 'The JSX runtime',
    about:
      'Imported by the compiler when `jsxImportSource` is `pipis`, from `pipis/jsx-runtime` and `pipis/jsx-dev-runtime`. An app never writes these.',
    names: ['Component', 'JSXKey', 'jsx', 'jsxs', 'jsxDEV', 'SourceInfo'],
  },
];

/** The declarations the compiler emits for the library, in a folder under out/. */
function emit(): string {
  const dir = join(root, 'out', 'api-types');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.types.json'), '--outDir', dir],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  return dir;
}

/** A doc comment as Markdown: the comment markers go, and a `{@link X}` becomes `X` in code. */
function markdownOf(comment: string): string {
  return comment
    .replace(/^\s*\/\*\*/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\* ?/, ''))
    .join('\n')
    .replace(/\{@link\s+(?:\S+\s+)?([^}\s]+)\}/g, '`$1`')
    .replace(/\{@link\s+([^}\s]+)\s+([^}]+)\}/g, '`$2`')
    .trim();
}

const STARTS = /^(export |declare |type |interface |const |function |class |import )/;

/** The exported declarations of one `.d.ts` text, each with the comment that stands before it. */
export function parseDeclarations(text: string, from: string): Declaration[] {
  const out: Declaration[] = [];
  const lines = text.split('\n');
  let comment = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('/**')) {
      let end = i;
      while (end < lines.length && !(lines[end] ?? '').includes('*/')) end++;
      // A comment that stands on a line of its own is the next declaration's; the end of a line like `x; /** ...` is not handled, and
      // the source does not write one.
      comment = lines.slice(i, end + 1).join('\n');
      i = end;
      continue;
    }
    if (!STARTS.test(line)) continue;
    // A statement runs until its brackets are closed and a line ends it.
    let depth = 0;
    const statement: string[] = [];
    let j = i;
    for (; j < lines.length; j++) {
      const l = lines[j] ?? '';
      statement.push(l);
      for (const ch of l.replace(/=>/g, '')) {
        if ('({['.includes(ch)) depth++;
        else if (')}]'.includes(ch)) depth--;
      }
      // An interface or a class ends with a closing brace of its own, and a type or a function with a semicolon.
      if (depth <= 0 && (l.trimEnd().endsWith(';') || l.trim() === '}')) break;
    }
    i = j;
    const code = statement.join('\n');
    const doc = markdownOf(comment);
    comment = '';
    const m = /^export (?:declare )?(function|const|type|interface|class) (\w+)/.exec(code);
    if (!m || code.startsWith('export {') || doc.includes('@internal')) continue;
    out.push({ name: m[2] ?? '', kind: m[1] as Kind, doc, code: code.replace(/^export (?:declare )?/, ''), from });
  }
  return out;
}

/** Every public declaration, in the order of the files, with the doc comment problems found on the way. */
export function load(): { declarations: Declaration[]; problems: string[] } {
  const dir = emit();
  const declarations = Object.entries(ENTRY).flatMap(([module, from]) =>
    parseDeclarations(readFileSync(join(dir, `${module}.d.ts`), 'utf8'), from).filter(
      // `export { Fragment } from './core.ts'` is a re-export, which `parseDeclarations` leaves out; a name declared twice is the overloads.
      (d) => d.name !== '',
    ),
  );
  const problems: string[] = [];
  const placed = new Map<string, number>();
  for (const { names } of STRUCTURE) for (const n of names) placed.set(n, (placed.get(n) ?? 0) + 1);
  const exported = new Set(declarations.map((d) => d.name));
  for (const name of exported) {
    if (!placed.has(name)) problems.push(`'${name}' is exported but is not placed in STRUCTURE (tools/api.ts)`);
  }
  for (const [name, count] of placed) {
    if (!exported.has(name)) problems.push(`STRUCTURE places '${name}', which is not exported`);
    if (count > 1) problems.push(`'${name}' is placed in STRUCTURE ${count} times`);
  }
  for (const d of declarations) {
    if (!d.doc) problems.push(`'${d.name}' (${d.from}) has no doc comment: its first sentence is what the reference shows`);
  }
  return { declarations, problems };
}

/** The reference, as Markdown. */
export function reference(declarations: Declaration[]): string {
  const out: string[] = [
    // The front matter the documentation site reads (docs/authoring.md): what the page is for, and its topic.
    '---',
    'description: Every export of the package, with its signature. Generated from the source.',
    'tags: [types]',
    '---',
    '# API reference',
    '',
    "Every export of the package, with its signature and what it does. This page is generated from the library's declarations and doc comments by `node tools/api.ts --out docs/reference/api.md`: do not edit it by hand.",
    '',
    'Names are imported from `pipis` unless a section says otherwise.',
    '',
  ];
  for (const { title, about, names } of STRUCTURE) {
    out.push(`## ${title}`, '', about, '');
    for (const name of names) {
      const same = declarations.filter((d) => d.name === name);
      const first = same[0];
      if (!first) continue;
      out.push(`### \`${name}\``, '');
      if (first.from !== 'pipis') out.push(`From \`${first.from}\`.`, '');
      for (const d of same) {
        out.push(d.doc, '', '```ts', d.code, '```', '');
      }
    }
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { declarations, problems } = load();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const markdown = reference(declarations);
  const at = process.argv.indexOf('--out');
  if (at > 0 && process.argv[at + 1]) writeFileSync(resolve(process.argv[at + 1] ?? ''), markdown);
  else process.stdout.write(markdown);
}
