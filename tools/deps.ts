// The runtime import graph of src/pipis/: which module needs which when the code runs, with imports that are only types left out (they
// are erased, so they cost nothing and cannot pull a feature into a bundle). `node tools/deps.ts` prints it; tools/deps.test.ts holds it
// to the layering below.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A path, not a URL: under jsdom the global `URL` is jsdom's, which `node:fs` does not accept.
const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/pipis');

/**
 * The library's modules and what each may import at run time. Each is a layer an app opts into by importing it: `base` is what every
 * app pulls in, `core` builds elements on it, `reactive` adds state, `dynamic` adds the structural elements, and the JSX runtime is
 * separate so that an app that writes JSX over core alone does not pull in `reactive`. A module that needs another has to say so here,
 * on purpose.
 *
 * `#platform` is what the nodes are made with: the browser's `platform.client`, or `platform.server` when the bundler is told it is a
 * server (see docs/adr/0019-server-rendering.md). It is an import of the package itself, so it is named here as it is written. Nothing
 * but `core`, `dynamic` and `server` may use it, and the two platforms may not use each other, so that neither is in the other's bundle.
 */
export const LIBRARY: Record<string, string[]> = {
  base: [],
  internal: [],
  'platform.client': ['base', 'internal'],
  'platform.server': ['base', 'internal', 'reflect'],
  reflect: [],
  core: ['base', '#platform'],
  reactive: ['base'],
  dynamic: ['base', 'core', 'reactive', '#platform'],
  server: ['#platform', 'platform.server'],
  'jsx-runtime': ['core'],
  'jsx-dev-runtime': ['jsx-runtime', 'core'],
};

/** The one import of the package itself that the library makes: the platform, chosen by the bundler. */
export const PLATFORM_IMPORT = '#platform';

/** Modules with no runtime code: they are declarations, so they ship as `.d.ts` only. */
export const TYPES_ONLY = ['svg', 'platform'];

/** The package's entry module: it re-exports the library's modules, so it is left out of the graph. Which it re-exports is held by the test. */
export const BARREL = 'index';

/** The entry points of the package: what `exports` in package.json names, so what a user can import. */
export const ENTRY_POINTS = ['index', 'jsx-runtime', 'jsx-dev-runtime', 'server'];

const moduleName = (file: string) => file.replace(/\.tsx?$/, '');

/** Every source file in src/pipis that is not a test, by module name. */
export function sourceFiles(): string[] {
  return readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map(moduleName);
}

type Import = { specifier: string; runtime: boolean };

/** The `import` and `re-export` statements of a module, and whether each leaves anything behind at run time. */
export function importsOf(module: string): Import[] {
  const file = readdirSync(dir).find((f) => moduleName(f) === module && !/\.test\.tsx?$/.test(f));
  if (!file) throw new Error(`no module named ${module}`);
  const text = readFileSync(join(dir, file), 'utf8');
  const found: Import[] = [];
  for (const m of text.matchAll(/^(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*(['"])([^'"]+)\3/gms)) {
    const [, isType, clause = '', , specifier = ''] = m;
    // `import { type A, type B }` keeps nothing once the types are stripped, unless something else is named.
    const names =
      /\{([^}]*)\}/
        .exec(clause)?.[1]
        ?.split(',')
        .map((n) => n.trim())
        .filter(Boolean) ?? [];
    const outsideBraces =
      clause
        .replace(/\{[^}]*\}/, '')
        .replace(/,/g, '')
        .trim() !== '';
    found.push({ specifier, runtime: !isType && (outsideBraces || names.some((n) => !n.startsWith('type '))) });
  }
  for (const m of text.matchAll(/^import\s*(['"])([^'"]+)\1/gm)) found.push({ specifier: m[2] ?? '', runtime: true });
  return found;
}

/** What each library module needs at run time from the others, by name. External imports are reported under the specifier as written. */
export function runtimeGraph(): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const module of sourceFiles()) {
    if (module === BARREL) continue;
    const needs = new Set<string>();
    for (const { specifier, runtime } of importsOf(module)) {
      if (!runtime) continue;
      const relative = /^\.\/([\w.-]+?)\.tsx?$/.exec(specifier);
      needs.add(relative?.[1] ?? specifier);
    }
    graph.set(module, needs);
  }
  return graph;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  for (const [module, needs] of runtimeGraph()) console.log(`${module} -> ${[...needs].join(', ') || '(nothing)'}`);
}
