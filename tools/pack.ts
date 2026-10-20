// Builds what a user installs, as a tarball: the library's own modules with the types taken out (and `.ts` import paths turned into
// `.js`), beside their declarations. Not bundled and not minified: a library is bundled by the app that uses it, and a stack trace or a
// class name in an error should read as the source does, line for line.
//   node tools/pack.ts [outdir]     prints the path of the tarball
import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTRY_POINTS, LIBRARY } from './deps.ts';
import { declarationImports, stripToJs } from './strip-types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(root, 'out', 'package');
const pkg = join(out, 'pipis');

/** The modules that ship as JavaScript: the library's, and the barrel that is the main entry point. Types-only modules ship as declarations alone. */
export const SHIPPED = ['index', ...Object.keys(LIBRARY)];

rmSync(out, { recursive: true, force: true });
mkdirSync(join(pkg, 'dist'), { recursive: true });

// The declarations come from the compiler. The JavaScript does not: it is each module with its types blanked out (Node's own type
// stripping, `erasableSyntaxOnly` being what makes that possible), so every line is where it is in the source and a stack trace from an
// installed library names the line to open in the repository.
execFileSync(
  process.execPath,
  [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.types.json'), '--outDir', join(pkg, 'dist')],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
for (const file of readdirSync(join(pkg, 'dist')).filter((f) => f.endsWith('.d.ts'))) {
  const path = join(pkg, 'dist', file);
  writeFileSync(path, declarationImports(readFileSync(path, 'utf8')));
}
for (const module of SHIPPED) {
  writeFileSync(join(pkg, 'dist', `${module}.js`), stripToJs(readFileSync(join(root, 'src/pipis', `${module}.ts`), 'utf8')));
}

// `engines` is not copied from the root package.json: that is what the repository's own tooling needs, and the library runs wherever
// its syntax does (docs/adr/0016-platform-floor.md).
const dev = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const entry = (name: string) => ({ types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` });
const exports: Record<string, { types: string; default: string }> = {};
for (const name of ENTRY_POINTS) exports[name === 'index' ? '.' : `./${name}`] = entry(name);
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
      // The platform is the bundler's choice: the browser's unless it is told it is a server (docs/adr/0019-server-rendering.md).
      imports: { '#platform': { 'pipis-server': entry('platform.server'), default: entry('platform.client') } },
      exports,
      types: './dist/index.d.ts',
    },
    null,
    2,
  ) + '\n',
);
cpSync(join(root, 'LICENSE'), join(pkg, 'LICENSE'));
cpSync(join(root, 'README.md'), join(pkg, 'README.md'));
// The reference written for AI agents travels with the version it describes, so an agent reading node_modules reads the right one.
cpSync(join(root, 'LLM.md'), join(pkg, 'LLM.md'));
const tgz = execSync('npm pack --silent', { cwd: pkg }).toString().trim();
console.log(join(pkg, tgz));
