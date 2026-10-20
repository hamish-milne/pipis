import { describe, expect, it } from 'vite-plus/test';
import { BARREL, ENTRY_POINTS, LIBRARY, PLATFORM_IMPORT, TYPES_ONLY, importsOf, runtimeGraph, sourceFiles } from './deps.ts';

// Holds the runtime import graph to its layering, so that a feature cannot end up in every bundle by accident: an `import` of something
// only used as a type has to be `import type`, and a module that needs another has to say so in LIBRARY (tools/deps.ts). The numbers this
// protects are in tools/size.ts.

describe('the library layers', () => {
  const graph = runtimeGraph();

  it('has every module of src/pipis classified, so a new file is placed on purpose', () => {
    const known = new Set([BARREL, ...Object.keys(LIBRARY), ...TYPES_ONLY]);
    expect(sourceFiles().filter((m) => !known.has(m))).toEqual([]);
    expect([...known].filter((m) => !sourceFiles().includes(m))).toEqual([]);
  });

  it('imports at run time only what LIBRARY allows each module', () => {
    for (const [module, allowed] of Object.entries(LIBRARY)) {
      const needs = [...(graph.get(module) ?? [])].sort();
      expect(needs, `${module} needs ${needs.join(', ')} at run time`).toEqual([...allowed].sort());
    }
  });

  it('lets base, the one thing every app pulls in, import nothing at run time', () => {
    expect([...(graph.get('base') ?? [])]).toEqual([]);
  });

  it('lets no library module import from outside the library, except for the platform, which is the package importing itself', () => {
    for (const module of Object.keys(LIBRARY)) {
      const outside = importsOf(module).filter(({ specifier }) => !specifier.startsWith('.') && specifier !== PLATFORM_IMPORT);
      expect(outside, `${module} imports from outside the library`).toEqual([]);
    }
  });

  it('keeps the two platforms apart: neither is in the other build, and only the layers above them choose between them', () => {
    const users = Object.entries(LIBRARY)
      .filter(([, allowed]) => allowed.includes(PLATFORM_IMPORT))
      .map(([module]) => module)
      .sort();
    expect(users).toEqual(['core', 'dynamic', 'server']);
    for (const platform of ['platform.client', 'platform.server']) {
      const other = platform === 'platform.client' ? 'platform.server' : 'platform.client';
      expect([...(graph.get(platform) ?? [])].filter((n) => n === other || n === PLATFORM_IMPORT)).toEqual([]);
    }
  });

  it('has no cycle', () => {
    const state = new Map<string, 1 | 2>();
    const cycles: string[] = [];
    const visit = (module: string, path: string[]) => {
      if (state.get(module) === 2) return;
      if (state.get(module) === 1) {
        cycles.push([...path.slice(path.indexOf(module)), module].join(' → '));
        return;
      }
      state.set(module, 1);
      for (const next of graph.get(module) ?? []) visit(next, [...path, module]);
      state.set(module, 2);
    };
    for (const module of graph.keys()) visit(module, []);
    expect(cycles).toEqual([]);
  });

  it('has a barrel that re-exports exactly the modules that make up the main entry point', () => {
    const reexported = importsOf(BARREL)
      .map(({ specifier }) => /^\.\/([\w-]+)\.ts$/.exec(specifier)?.[1] ?? '')
      .sort((a, b) => a.localeCompare(b));
    // The platform is not among them: of what it provides only three names are public, so it is re-exported by name.
    expect(reexported.filter(Boolean)).toEqual(['base', 'core', 'dynamic', 'reactive']);
    expect(importsOf(BARREL).some(({ specifier }) => specifier === PLATFORM_IMPORT)).toBe(true);
  });

  it('exports from the main entry point what an app uses, and none of what only the library does', async () => {
    const names = Object.keys(await import('../src/pipis/index.ts'));
    expect(names).toEqual(
      expect.arrayContaining([
        'reactive',
        'select',
        'If',
        'createElement',
        'Fragment',
        'textNode',
        'createMarker',
        'IS_CLIENT',
        'moveNode',
        'setRef',
      ]),
    );
    for (const internal of ['isEmpty', 'setText', 'ATTRIBUTE_PROP', 'createNode', 'setAttribute', 'head', 'element']) {
      expect(names, `${internal} is the library's own`).not.toContain(internal);
    }
  });

  it('keeps the JSX runtime out of the barrel, so JSX over core alone does not pull in the rest', () => {
    const reexported = importsOf(BARREL).map(({ specifier }) => specifier);
    expect(reexported.some((s) => s.includes('jsx'))).toBe(false);
    expect(ENTRY_POINTS).toEqual(['index', 'jsx-runtime', 'jsx-dev-runtime', 'server']);
  });
});
