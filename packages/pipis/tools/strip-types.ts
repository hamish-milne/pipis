// A module's JavaScript, made the way the packaged library's is: the types blanked out by Node's own type stripping (so every line and
// column stays where it is in the source), and the relative `.ts` import paths made `.js`, which is the same length.
import { stripTypeScriptTypes } from 'node:module';

// Node marks `stripTypeScriptTypes` experimental and says so the first time it is used. That one warning is dropped here, and everything
// else Node has to say is still printed. It does not matter whether or not a Node release still marks it experimental: the packer's
// output is checked by `packages/pipis/tools/pack.test.ts`, which is what would notice the function changing.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && warning.message.includes('stripTypeScriptTypes')) return;
  console.error(warning.stack ?? `${warning.name}: ${warning.message}`);
});

const RELATIVE_TS = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.{1,2}\/[^'"]+)\.ts\2/g;

/** Source in erasable TypeScript, as JavaScript with every line where it was. */
export function stripToJs(source: string): string {
  return stripTypeScriptTypes(source, { mode: 'strip' }).replace(RELATIVE_TS, '$1.js$2');
}

/** A declaration file that names its neighbours as `./x.ts`, naming them `./x.js`: the form every module resolution reads as `x.d.ts`. */
export function declarationImports(source: string): string {
  return source.replace(/((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.{1,2}\/[^'"]+)\.ts\2/g, '$1.js$2');
}
