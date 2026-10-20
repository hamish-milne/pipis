import { describe, expect, it } from 'vite-plus/test';
import { BARREL, ENTRY_POINTS, LIBRARY, TYPES_ONLY, importsOf, runtimeGraph, sourceFiles } from './deps.ts';

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

  it('lets core, the one thing every app pulls in, import nothing at run time', () => {
    expect([...(graph.get('core') ?? [])]).toEqual([]);
  });

  it('lets only what is listed import from outside the library: no library module does', () => {
    for (const module of Object.keys(LIBRARY)) {
      const outside = importsOf(module).filter(({ specifier }) => !specifier.startsWith('.'));
      expect(outside, `${module} imports from outside the library`).toEqual([]);
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
    expect(reexported).toEqual(['core', 'dynamic', 'reactive']);
  });

  it('keeps the JSX runtime out of the barrel, so JSX over core alone does not pull in the rest', () => {
    const reexported = importsOf(BARREL).map(({ specifier }) => specifier);
    expect(reexported.some((s) => s.includes('jsx'))).toBe(false);
    expect(ENTRY_POINTS).toEqual(['index', 'jsx-runtime', 'jsx-dev-runtime']);
  });
});
