// The search index, from the pages as written. Only the text inside `data-pagefind-body` is read, so the frames and chrome are not.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as pagefind from 'pagefind';

export async function writeSearchIndex(out: string): Promise<void> {
  const { index: created } = await pagefind.createIndex({});
  if (!created) throw new Error('Pagefind could not make an index');
  const added = await created.addDirectory({ path: out });
  if (added.errors.length) throw new Error(added.errors.join('\n'));
  const written = await created.writeFiles({ outputPath: join(out, 'pagefind') });
  if (written.errors.length) throw new Error(written.errors.join('\n'));
  await pagefind.close();
  // Pagefind also writes a search box of its own and a highlighter; the site has its own search, and these are not loaded by it.
  for (const name of readdirSync(join(out, 'pagefind'))) {
    if (/^pagefind-(?:component-|modular-)?(?:ui|highlight)/.test(name)) rmSync(join(out, 'pagefind', name));
  }
}
