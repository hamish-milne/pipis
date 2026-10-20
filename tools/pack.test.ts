import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { ENTRY_POINTS, LIBRARY } from './deps.ts';

// The tarball a release publishes, and what a user gets from it: built, installed into a clean project, type-checked there under both
// module resolutions, and run. Nothing here reads the repository's sources except to compare line counts.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules/typescript/bin/tsc');

let work = '';
let tarball = '';
let project = '';
let version = '';

// `tar` runs next to the tarball and is given its bare name: GNU tar reads `C:\...` as a file on a host called `C`.
const tar = (...args: string[]) =>
  execFileSync('tar', [args[0] ?? '', basename(tarball), ...args.slice(1)], { cwd: dirname(tarball) }).toString();

/** The files of the tarball, and a way to read one. */
const listing = () =>
  new Set(
    tar('-tzf')
      .split('\n')
      .filter(Boolean)
      .map((f) => f.replace(/^package\//, '')),
  );
const read = (path: string) => tar('-xzOf', `package/${path}`);

const APP = `import { Dynamic, ErrorBoundary, IS_CLIENT, If, List, OneOf, ReactiveList, Suspense, adapt, patch, reactive, select, type JSXElement } from 'pipis';
import { renderToString, serializeData, type RenderResult } from 'pipis/server';

type Product = { id: number; name: string; quantity: number };

export function Counter() {
  const count = reactive(0);
  const label = select(count, (n) => \`Clicked \${n} times\`);
  return <button onclick={() => (count.value = count.value + 1)}>{label}</button>;
}

export function Shop() {
  const products = reactive<readonly Product[]>([{ id: 1, name: 'apple', quantity: 1 }]);
  const show = reactive(true);
  const state = reactive({ a: 1, nested: { b: 2 } });
  patch(state, { nested: { b: 3 } });
  const external = adapt({ subscribe: (callback: () => void) => () => callback }, () => 1);
  return (
    <div className="shop" style={{ color: 'red', left: select(state, (s) => \`\${s.a}px\`) }}>
      <If condition={show}>
        <ReactiveList items={products} itemKey={(p) => p.id}>
          {(product) => (
            <p data-id={select(product, 'id')}>
              {select(product, 'name')} x {select(product, 'quantity')}
            </p>
          )}
        </ReactiveList>
      </If>
      <List items={reactive([1, 2])} itemKey={(n) => n}>
        {(n) => <i>{n}</i>}
      </List>
      <OneOf selector={select(show, (s) => (s ? 'on' : 'off'))}>{{ on: <b>on</b>, off: <b>off</b> }}</OneOf>
      <Dynamic value={external}>{(n) => <u>{n}</u>}</Dynamic>
      <ErrorBoundary fallback={() => <em>broke</em>}>
        <Suspense promise={() => Promise.resolve('x')} emptyData="" loading={<span>loading</span>}>
          {(data) => <span>{data}</span>}
        </Suspense>
      </ErrorBoundary>
      <svg viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" />
      </svg>
    </div>
  );
}

export const root: JSXElement = <Shop />;
export const mounted: JSXElement = Counter();
export const rendered: RenderResult = renderToString(<Shop />);
export const data: string = serializeData({ client: IS_CLIENT });
`;

// Each line is a mistake that must be rejected: if pipis's types came out as `any`, none of them would be.
const BAD = `import { reactive, select, If } from 'pipis';
const n = reactive(0);
export const a = <button onClick={() => {}} />;
export const b = <div class="x" />;
export const c = <If condition={true}>x</If>;
export const d = select(n, 'a', (v: number) => v);
export const e = <div style={{ left: 10 }} />;
`;

const SMOKE = `import { pathToFileURL } from 'node:url';
const { JSDOM } = await import(process.env.JSDOM_URL);
const dom = new JSDOM('<!doctype html><body></body>');
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLUnknownElement', 'SVGElement', 'Text', 'Comment', 'MouseEvent']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom.window : dom.window[name], configurable: true });
}
const pipis = await import('pipis');
const runtime = await import('pipis/jsx-runtime');
const dev = await import('pipis/jsx-dev-runtime');
const count = pipis.reactive(0);
const label = pipis.select(count, (n) => 'Clicked ' + n);
const button = runtime.jsx('button', { children: label, onclick: () => (count.value = count.value + 1) });
button(document.body);
document.body.querySelector('button').dispatchEvent(new dom.window.MouseEvent('click'));
const svg = dev.jsxDEV('svg', { children: runtime.jsx('circle', {}) }, undefined, false, undefined, undefined);
svg(document.body);
console.log(JSON.stringify({
  exports: Object.keys(pipis).sort(),
  runtime: Object.keys(runtime).sort(),
  text: document.body.querySelector('button').textContent,
  button: document.body.querySelector('button').namespaceURI,
  circle: document.body.querySelector('circle').namespaceURI,
}));
`;

// Built as a server is: `--conditions=pipis-server` is what a bundler is given as `conditions`, so `pipis` is the server's platform.
const SERVER = `import { IS_CLIENT, reactive, select, If, Helmet } from 'pipis';
import { jsx } from 'pipis/jsx-runtime';
import { renderToString, serializeData } from 'pipis/server';
const n = reactive(2);
const page = jsx('main', { className: 'a', children: [
  jsx('h1', { children: ['n is ', select(n, (v) => v * 2)] }),
  If({ condition: select(n, (v) => v > 1), children: jsx('p', { children: 'big & <bold>' }) }),
  Helmet({ children: jsx('title', { children: 'T' }) }),
] });
const out = renderToString(page);
console.log(JSON.stringify({ client: IS_CLIENT, html: out.html, head: out.head, data: serializeData({ a: '</script>' }), document: typeof document }));
`;

// Run as it is by default: no condition, no DOM. The server entry point must say what is wrong, not fail somewhere inside.
const NO_CONDITION = `import { IS_CLIENT } from 'pipis';
import { renderToString } from 'pipis/server';
let message = '';
try {
  renderToString(() => null);
} catch (error) {
  message = error.message;
}
console.log(JSON.stringify({ client: IS_CLIENT, message }));
`;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'pipis-pack-'));
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  tarball = execFileSync(process.execPath, [join(root, 'tools/pack.ts'), join(work, 'package')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .toString()
    .trim();
  // A clean project that has nothing but the tarball.
  project = join(work, 'consumer');
  mkdirSync(join(project, 'src'), { recursive: true });
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  writeFileSync(join(project, 'src/app.tsx'), APP);
  writeFileSync(join(project, 'src/bad.tsx'), BAD);
  const compilerOptions = {
    jsx: 'react-jsx',
    jsxImportSource: 'pipis',
    strict: true,
    target: 'es2022',
    lib: ['es2022', 'dom'],
    noEmit: true,
    types: [],
    skipLibCheck: false,
  };
  writeFileSync(
    join(project, 'tsconfig.bundler.json'),
    JSON.stringify({ compilerOptions: { ...compilerOptions, module: 'esnext', moduleResolution: 'bundler' }, include: ['src/app.tsx'] }),
  );
  writeFileSync(
    join(project, 'tsconfig.node16.json'),
    JSON.stringify({ compilerOptions: { ...compilerOptions, module: 'node16', moduleResolution: 'node16' }, include: ['src/app.tsx'] }),
  );
  writeFileSync(
    join(project, 'tsconfig.bad.json'),
    JSON.stringify({ compilerOptions: { ...compilerOptions, module: 'esnext', moduleResolution: 'bundler' }, include: ['src/bad.tsx'] }),
  );
  writeFileSync(join(project, 'smoke.mjs'), SMOKE);
  writeFileSync(join(project, 'server.mjs'), SERVER);
  writeFileSync(join(project, 'no-condition.mjs'), NO_CONDITION);
  execSync(`npm install "${tarball}" --no-audit --no-fund --offline --loglevel=error`, { cwd: project });
}, 240_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

const check = (config: string) => spawnSync(process.execPath, [tsc, '-p', config], { cwd: project, encoding: 'utf8' });

describe('the tarball', () => {
  it('has the metadata npm shows, and the one version from the repository root', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.name).toBe('pipis');
    expect(manifest.version).toBe(version);
    expect(manifest.license).toBe('MIT');
    expect(manifest.repository.url).toMatch(/neofox-solutions\/pipis\.git$/);
    expect(manifest.type).toBe('module');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.private).toBeUndefined();
    // `engines` is the repository's tooling, not what the library needs.
    expect(manifest.engines).toBeUndefined();
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it('exports exactly the entry points, each with types and a file that is in the tarball', () => {
    const manifest = JSON.parse(read('package.json'));
    const files = listing();
    expect(Object.keys(manifest.exports)).toEqual(ENTRY_POINTS.map((name) => (name === 'index' ? '.' : `./${name}`)));
    for (const [path, entry] of Object.entries<{ types: string; default: string }>(manifest.exports)) {
      for (const target of [entry.types, entry.default])
        expect(files.has(target.replace(/^\.\//, '')), `${path} points at ${target}`).toBe(true);
    }
    expect(manifest.types).toBe('./dist/index.d.ts');
    for (const file of ['LICENSE', 'README.md', 'LLM.md']) expect(files.has(file), file).toBe(true);
  });

  it('chooses the platform through an import of its own, the browser build unless the bundler says server', () => {
    const manifest = JSON.parse(read('package.json'));
    const files = listing();
    expect(Object.keys(manifest.imports)).toEqual(['#platform']);
    expect(Object.keys(manifest.imports['#platform'])).toEqual(['pipis-server', 'default']);
    expect(manifest.imports['#platform'].default.default).toBe('./dist/platform.client.js');
    expect(manifest.imports['#platform']['pipis-server'].default).toBe('./dist/platform.server.js');
    for (const choice of Object.values<{ types: string; default: string }>(manifest.imports['#platform'])) {
      for (const target of [choice.types, choice.default]) expect(files.has(target.replace(/^\.\//, '')), target).toBe(true);
    }
  });

  it('holds the library and nothing else: no source, tests, site helpers or tooling', () => {
    const files = [...listing()].sort();
    expect(files.filter((f) => !/^(dist\/[\w.-]+\.(js|d\.ts)|LICENSE|README\.md|LLM\.md|package\.json)$/.test(f))).toEqual([]);
    expect(files.filter((f) => /markdown|highlight|\.test\.|\.tsx?$/.test(f) && !f.endsWith('.d.ts'))).toEqual([]);
    expect(files.filter((f) => f.endsWith('.js')).sort()).toEqual(['index', ...Object.keys(LIBRARY)].map((m) => `dist/${m}.js`).sort());
  });

  it('has JavaScript that is the source with its types blanked, line for line', () => {
    for (const module of ['index', ...Object.keys(LIBRARY)]) {
      const built = read(`dist/${module}.js`);
      const source = readFileSync(join(root, 'src/pipis', `${module}.ts`), 'utf8');
      expect(built.split('\n').length, `${module}.js has the lines of ${module}.ts`).toBe(source.split('\n').length);
      expect(built).not.toMatch(/from\s*['"]\.\/[\w-]+\.ts['"]/);
      expect(built).not.toMatch(/^\s*(?:export\s+)?(?:type|interface)\s+\w+/m);
    }
  });

  it('names only files that are in it, in the JavaScript and the declarations', () => {
    const files = listing();
    for (const file of [...files].filter((f) => /^dist\/.*\.(js|d\.ts)$/.test(f))) {
      for (const m of read(file).matchAll(/(?:from|import)\s*\(?\s*['"](\.\/[^'"]+)['"]/g)) {
        const target = (m[1] ?? '').replace(/^\.\//, 'dist/');
        expect(files.has(file.endsWith('.d.ts') ? target.replace(/\.js$/, '.d.ts') : target), `${file} names ${m[1]}`).toBe(true);
      }
    }
  });
});

describe('a clean project that installed it', () => {
  it('type-checks a JSX app under moduleResolution "bundler", with library checking on', () => {
    const result = check('tsconfig.bundler.json');
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('type-checks the same app under module and moduleResolution "node16"', () => {
    const result = check('tsconfig.node16.json');
    expect(result.stdout + result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rejects the mistakes LLM.md names, so the types in the tarball are real', () => {
    const result = check('tsconfig.bad.json');
    expect(result.status).not.toBe(0);
    const lines = (result.stdout + result.stderr).split('\n').filter((l) => /^src\/bad\.tsx\(\d+,\d+\): error/.test(l));
    // One error for each mistake, on its own line of the file (the first line of it is the import).
    expect(lines.map((l) => /\((\d+),/.exec(l)?.[1])).toEqual(['3', '4', '5', '6', '7']);
  });

  it('runs: every entry point resolves through exports, and the packaged JavaScript renders in a DOM', () => {
    const jsdom = pathToFileURL(createRequire(import.meta.url).resolve('jsdom')).href;
    const run = spawnSync(process.execPath, ['smoke.mjs'], {
      cwd: project,
      encoding: 'utf8',
      env: { ...process.env, JSDOM_URL: jsdom },
    });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout);
    expect(out.text).toBe('Clicked 1');
    expect(out.button).toBe('http://www.w3.org/1999/xhtml');
    expect(out.circle).toBe('http://www.w3.org/2000/svg');
    expect(out.exports).toEqual(
      expect.arrayContaining(['If', 'List', 'ReactiveList', 'adapt', 'createElement', 'patch', 'reactive', 'select']),
    );
    expect(out.runtime).toEqual(['Fragment', 'jsx', 'jsxs']);
  });

  it('renders on a server, with no DOM, when the bundler says the platform is the server', () => {
    const run = spawnSync(process.execPath, ['--conditions=pipis-server', 'server.mjs'], { cwd: project, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      client: false,
      html: '<main class="a"><h1>n is 4</h1><!----><p>big &amp; &lt;bold&gt;</p></main>',
      head: '<title>T</title>',
      data: '{"a":"\\u003c/script\\u003e"}',
      document: 'undefined',
    });
  });

  it('is the browser by default, and the server entry point says what to do about it', () => {
    const run = spawnSync(process.execPath, ['no-condition.mjs'], { cwd: project, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout);
    expect(out.client).toBe(true);
    expect(out.message).toContain("'pipis-server' condition");
  });
});
