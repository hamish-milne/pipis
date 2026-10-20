import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

// The tarball a release publishes: built, unpacked, and its entry points loaded by Node with the dependencies the kit has here.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let work = '';
let tarball = '';
let unpacked = '';

const tar = (...args: string[]) =>
  execFileSync('tar', [args[0] ?? '', basename(tarball), ...args.slice(1)], { cwd: dirname(tarball) }).toString();
const manifest = () => JSON.parse(readFileSync(join(unpacked, 'package.json'), 'utf8'));

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'docs-kit-pack-'));
  tarball =
    execFileSync(process.execPath, [join(root, 'tools/pack.ts'), work], { cwd: root })
      .toString()
      .trim()
      .split('\n')
      .pop() ?? '';
  unpacked = join(work, 'unpacked');
  mkdirSync(unpacked);
  execFileSync('tar', ['-xzf', basename(tarball), '-C', unpacked, '--strip-components=1'], { cwd: dirname(tarball) });
  // Its dependencies, as the kit has them in the repository: what `npm install` would put beside it.
  symlinkSync(join(root, 'node_modules'), join(unpacked, 'node_modules'), 'junction');
}, 120_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('the tarball', () => {
  it('has JavaScript and declarations, the style sheets, and no TypeScript source', () => {
    const files = tar('-tzf').split('\n').filter(Boolean);
    expect(files).toContain('package/dist/vite.js');
    expect(files).toContain('package/dist/vite.d.ts');
    expect(files).toContain('package/dist/kit.css');
    expect(files).toContain('package/dist/frame.css');
    expect(files).toContain('package/dist/client/frame.js');
    expect(files.filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))).toEqual([]);
    expect(files.filter((f) => /\.test\./.test(f))).toEqual([]);
  });

  it('has a manifest of its own: not private, versions rather than the catalog, and a peer dependency on Vite', () => {
    const m = manifest();
    expect(m.name).toBe('@pipis/docs-kit');
    expect(m.private).toBeUndefined();
    expect(m.version).toMatch(/-beta\./);
    expect(JSON.stringify(m.dependencies)).not.toMatch(/catalog:|workspace:/);
    expect(Object.keys(m.dependencies).sort()).toEqual(['marked', 'pagefind', 'prism-code-editor', 'rolldown', 'sucrase']);
    expect(m.peerDependencies.vite).toBeTruthy();
  });

  it('names only files that are in it', () => {
    const exports: Record<string, unknown> = manifest().exports;
    for (const [key, value] of Object.entries(exports)) {
      const targets = typeof value === 'string' ? [value] : Object.values<string>(value as Record<string, string>);
      for (const target of targets) expect(existsSync(join(unpacked, target)), `${key}: ${target}`).toBe(true);
    }
  });

  it('loads: every entry point resolves, and the plugin is made', async () => {
    const exports: Record<string, unknown> = manifest().exports;
    for (const key of Object.keys(exports)) {
      if (key === './package.json' || key === './client/edit') continue; // the editor is the browser's
      await import(pathToFileURL(join(unpacked, (exports[key] as { default: string }).default)).href);
    }
    const kit = await import(pathToFileURL(join(unpacked, 'dist/vite.js')).href);
    expect(typeof kit.docsKit).toBe('function');
    expect(typeof kit.moduleFiles).toBe('function');
  });
});
