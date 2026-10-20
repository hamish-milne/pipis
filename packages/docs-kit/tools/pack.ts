// Builds what a user installs of @pipis/docs-kit, as a tarball: the kit's modules with the types taken out (and `.ts` import paths turned into `.js`), beside
// their declarations and the style sheets they read. Not bundled: it is a Vite plugin, loaded by Node, and its dependencies are its own.
//   node packages/docs-kit/tools/pack.ts [outdir]     prints the path of the tarball
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypes } from '../src/strip.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(root, 'out', 'package');
const pkg = join(out, 'docs-kit');
const dist = join(pkg, 'dist');

const RELATIVE_TS = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.{1,2}\/[^'"]+)\.ts\2/g;
const toJs = (source: string) => source.replace(RELATIVE_TS, '$1.js$2');

rmSync(out, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// The declarations come from the compiler.
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.types.json'), '--outDir', dist], {
  cwd: root,
  stdio: 'inherit',
});
for (const file of listing(dist).filter((f) => f.endsWith('.d.ts'))) {
  const path = join(dist, file);
  writeFileSync(path, toJs(readFileSync(path, 'utf8')));
}

// The JavaScript is each module with its types blanked; the style sheets and hand-written declarations are copied as they are.
for (const file of listing(join(root, 'src'))) {
  if (file.endsWith('.test.ts')) continue;
  const from = join(root, 'src', file);
  const to = join(dist, file);
  mkdirSync(dirname(to), { recursive: true });
  if (file.endsWith('.d.ts') || file.endsWith('.css')) cpSync(from, to);
  else if (file.endsWith('.ts')) writeFileSync(to.replace(/\.ts$/, '.js'), toJs(stripTypes(readFileSync(from, 'utf8'))));
}

/** The files under `dir`, as paths relative to it with `/`. */
function listing(dir: string, base = ''): string[] {
  return readdirSync(join(dir, base), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listing(dir, `${base}${entry.name}/`) : [`${base}${entry.name}`],
  );
}

// `catalog:` is the repository's way of choosing a version once; the package says the version.
const catalog: Record<string, string> = {};
let inCatalog = false;
for (const line of readFileSync(join(root, '../../pnpm-workspace.yaml'), 'utf8').split('\n')) {
  if (line.startsWith('catalog:')) inCatalog = true;
  else if (/^\S/.test(line)) inCatalog = false;
  const match = inCatalog && /^\s+'?([^':\s]+)'?:\s*(\S+)/.exec(line);
  if (match) catalog[match[1] ?? ''] = match[2] ?? '';
}
const dev = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dependencies: Record<string, string> = {};
for (const [name, range] of Object.entries<string>(dev.dependencies)) {
  const version = range === 'catalog:' ? catalog[name] : range;
  if (!version) throw new Error(`${name} has no version in the catalog`);
  dependencies[name] = version;
}

const exports: Record<string, { types: string; default: string }> = {};
for (const [key, source] of Object.entries<string>(dev.exports)) {
  if (key === './package.json') continue;
  const name = source.replace(/^\.\/src\//, '').replace(/\.ts$/, '');
  exports[key] = { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` };
}
(exports as Record<string, unknown>)['./package.json'] = './package.json';
writeFileSync(
  join(pkg, 'package.json'),
  JSON.stringify(
    {
      name: dev.name,
      version: dev.version,
      description: dev.description,
      license: dev.license,
      author: dev.author,
      repository: dev.repository,
      homepage: dev.homepage,
      bugs: dev.bugs,
      keywords: dev.keywords,
      type: 'module',
      sideEffects: false,
      engines: dev.engines,
      exports,
      types: './dist/vite.d.ts',
      dependencies,
      peerDependencies: dev.peerDependencies,
    },
    null,
    2,
  ) + '\n',
);
cpSync(join(root, '../../LICENSE'), join(pkg, 'LICENSE'));
cpSync(join(root, 'README.md'), join(pkg, 'README.md'));
const tgz = execSync('npm pack --silent', { cwd: pkg }).toString().trim();
console.log(join(pkg, tgz));
