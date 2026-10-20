import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { load, reference } from './api.ts';

// The API reference is generated from the library's own declarations and doc comments (packages/pipis/tools/api.ts), and docs/reference/api.md is what it prints.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('the API reference', () => {
  const generated = load();

  it('documents every export, and places it', () => {
    expect(generated.problems).toEqual([]);
  });

  it('is what the generator prints, so it cannot have drifted', () => {
    const file = readFileSync(join(repo, 'docs/reference/api.md'), 'utf8').replace(/\r\n/g, '\n');
    expect(file, 'docs/reference/api.md is stale: run `node packages/pipis/tools/api.ts --out docs/reference/api.md`').toBe(
      reference(generated.declarations),
    );
  }, 60_000);
});
