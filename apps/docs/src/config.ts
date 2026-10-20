// What is particular to this site. The repository's address is taken from package.json, so that the move of the repository to its home
// is one change there.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const siteTitle = 'pipis';

/** The repository's page on its host. */
export const repoHome = (() => {
  const url: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '../../../packages/pipis/package.json'), 'utf8')).repository?.url;
  return String(url)
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
})();

/** The files of the repository, for links from the documentation to a file that is not a page of it (`LLM.md`). */
export const repoFiles = `${repoHome}/blob/main`;
