// Bundle size per scenario: each is a small program that uses pipis the way an app would, bundled through the package's entry
// points with Rolldown (minified, ESM, tree-shaken), then measured raw, gzip and brotli. A feature's row says what it costs on top
// of the counter app, which is what an app that uses reactive state already pays.
//   node packages/pipis/tools/size.ts            the table
//   node packages/pipis/tools/size.ts --check    fails if a scenario's gzip size is more than the tolerance over packages/pipis/tools/size-baseline.json
//   node packages/pipis/tools/size.ts --update   writes the baseline from the current sizes (a reviewable diff: do it on purpose, say why in the commit)
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { bundle } from './bundle.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const baselineFile = root + 'tools/size-baseline.json';
const alias = {
  pipis: root + 'src/index.ts',
  'pipis/jsx-runtime': root + 'src/jsx-runtime.ts',
  'pipis/islands': root + 'src/islands.ts',
};

type Scenario = {
  name: string;
  /** The program. Imports are from 'pipis'. */
  source: string;
  /** Compiled as JSX through pipis's own runtime. */
  jsx?: boolean;
  /** The row this one is a delta against. */
  base?: string;
};

const COUNTER = 'The counter app';
const counter = (extraImports = '', extra = '') => `import { reactive, select, createElement${extraImports} } from 'pipis';
const count = reactive(0);
const label = select(count, (n) => 'Clicked ' + n + ' times');
export const app = createElement('button', { onclick: () => (count.value = count.value + 1), children: [label${extra}] });
`;

const SCENARIOS: Scenario[] = [
  {
    name: 'A static element (core only)',
    source: `import { createElement } from 'pipis';
export const app = createElement('p', { children: 'hello' });`,
  },
  { name: COUNTER, source: counter() },
  {
    name: 'The counter app written as JSX',
    jsx: true,
    source: `import { reactive, select } from 'pipis';
const count = reactive(0);
const label = select(count, (n) => 'Clicked ' + n + ' times');
export const app = <button onclick={() => (count.value = count.value + 1)}>{label}</button>;`,
    base: COUNTER,
  },
  {
    name: 'patch',
    source: counter(', patch', ', patch(reactive({ a: 1 }), { a: 2 })'),
    base: COUNTER,
  },
  {
    name: 'If',
    source: counter(', If', ", If({ condition: select(count, (n) => n > 1), children: 'x' })"),
    base: COUNTER,
  },
  {
    name: 'OneOf',
    source: counter(', OneOf', ", OneOf({ selector: select(count, (n) => (n > 1 ? 'a' : 'b')), children: { a: 'x', b: 'y' } })"),
    base: COUNTER,
  },
  {
    name: 'List',
    source: counter(
      ', List',
      ", List({ items: reactive([1]), itemKey: (n) => n, children: (n) => createElement('li', { children: String(n) }) })",
    ),
    base: COUNTER,
  },
  {
    name: 'ReactiveList',
    source: counter(
      ', ReactiveList',
      ", ReactiveList({ items: reactive([{ id: 1 }]), itemKey: (r) => r.id, children: (item) => createElement('li', { children: [select(item, 'id')] }) })",
    ),
    base: COUNTER,
  },
  {
    name: 'adapt (a store from another library)',
    source: counter(', adapt', ', adapt({ subscribe: (callback: () => void) => () => {} }, () => 1)'),
    base: COUNTER,
  },
  {
    name: 'Dynamic',
    source: counter(', Dynamic', ', Dynamic({ value: count, children: (n) => createElement("i", { children: String(n) }) })'),
    base: COUNTER,
  },
  {
    name: 'Effect',
    source: counter(', Effect', ', Effect({ children: () => { document.title = "x"; return undefined; } })'),
    base: COUNTER,
  },
  {
    name: 'Watch',
    source: counter(', Watch', ', Watch({ value: count, children: (n) => { document.title = String(n); } })'),
    base: COUNTER,
  },
  {
    name: 'Suspense',
    source: counter(
      ', Suspense',
      ", Suspense({ promise: () => fetch('/x').then((r) => r.text()), emptyData: '', loading: 'loading', children: (d) => createElement('p', { children: [d] }) })",
    ),
    base: COUNTER,
  },
  {
    name: 'ErrorBoundary',
    source: counter(', ErrorBoundary', ", ErrorBoundary({ fallback: () => createElement('p', { children: 'broke' }), children: 'x' })"),
    base: COUNTER,
  },
  {
    name: 'Portal + PortalTarget',
    source: counter(
      ', Portal, PortalTarget',
      ", Portal({ target: reactive(undefined), children: 'x' }), PortalTarget({ ref: reactive(undefined) })",
    ),
    base: COUNTER,
  },
  {
    name: 'Helmet',
    source: counter(', Helmet', ", Helmet({ children: createElement('title', { children: 'x' }) })"),
    base: COUNTER,
  },
  {
    // The browser's side of islands: the counter is mounted over the server's markup. (`Island`, which writes the marker, is the server's and is
    // not in this bundle.)
    name: 'mountIslands (the counter as an island)',
    source: `import { reactive, select, createElement } from 'pipis';
import { mountIslands } from 'pipis/islands';
function Counter() {
  const count = reactive(0);
  const label = select(count, (n) => 'Clicked ' + n + ' times');
  return createElement('button', { onclick: () => (count.value = count.value + 1), children: [label] });
}
export const unmount = mountIslands({ counter: Counter });`,
    base: COUNTER,
  },
  {
    name: 'Everything: every export, in one program',
    source: `import * as pipis from 'pipis';
export const app = pipis;`,
  },
];

const measure = async (s: Scenario) => {
  const code = await bundle({
    contents: s.source,
    alias,
    type: s.jsx ? 'tsx' : 'ts',
    ...(s.jsx ? { jsxImportSource: 'pipis' } : {}),
    minify: true,
  });
  const bytes = Buffer.from(code);
  return { raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length };
};

const results = new Map<string, Awaited<ReturnType<typeof measure>>>();
for (const s of SCENARIOS) results.set(s.name, await measure(s));

const rows = SCENARIOS.map((s) => {
  const r = results.get(s.name);
  if (!r) throw new Error(`no result for ${s.name}`);
  const base = s.base ? results.get(s.base) : undefined;
  return { name: s.name, ...r, delta: base ? r.gzip - base.gzip : undefined };
});
const width = Math.max(...rows.map((r) => r.name.length));
const num = (n: number | undefined, plus = false) => (n === undefined ? '' : (plus && n > 0 ? '+' : '') + n).padStart(7);
console.log(`${'scenario'.padEnd(width)}${'raw'.padStart(7)}${'gzip'.padStart(7)}${'brotli'.padStart(7)}${'Δ gzip'.padStart(8)}`);
for (const r of rows) console.log(`${r.name.padEnd(width)}${num(r.raw)}${num(r.gzip)}${num(r.brotli)}${num(r.delta, true).padStart(8)}`);

const mode = process.argv[2];
if (mode === '--update') {
  const baseline = { tolerance: 0.02, slackBytes: 16, gzip: Object.fromEntries(rows.map((r) => [r.name, r.gzip])) };
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`\nwrote ${baselineFile}`);
} else if (mode === '--check') {
  const baseline: { tolerance: number; slackBytes: number; gzip: Record<string, number> } = JSON.parse(readFileSync(baselineFile, 'utf8'));
  const problems: string[] = [];
  for (const r of rows) {
    const was = baseline.gzip[r.name];
    if (was === undefined) {
      problems.push(`"${r.name}" has no baseline: run \`node packages/pipis/tools/size.ts --update\` and say why in the commit`);
    } else if (r.gzip > was * (1 + baseline.tolerance) + baseline.slackBytes) {
      problems.push(
        `"${r.name}" grew from ${was} to ${r.gzip} bytes gzipped (more than ${baseline.tolerance * 100}% + ${baseline.slackBytes} bytes)`,
      );
    }
  }
  for (const name of Object.keys(baseline.gzip)) {
    if (!results.has(name)) problems.push(`the baseline names "${name}", which is no longer a scenario`);
  }
  if (problems.length) {
    console.error(`\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('\nsizes are within the baseline');
} else if (mode !== undefined) {
  console.error('usage: node packages/pipis/tools/size.ts [--check | --update]');
  process.exit(2);
}
