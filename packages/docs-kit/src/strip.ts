// A module of TypeScript as the JavaScript that a browser or Node can be given: its types blanked out, and its relative `.ts` imports named `.js`.
import { transform } from 'sucrase';

const RELATIVE_TS = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])\.{1,2}\/[^'"]+)\.ts\2/g;

/** `source` without its types. */
export function stripTypes(source: string): string {
  return transform(source, { transforms: ['typescript'], disableESTransforms: true, preserveDynamicImport: true }).code;
}

/** `source` as a module that is served as it is: no types, and its neighbours imported by the name they are served as. */
export function toModule(source: string): string {
  return stripTypes(source).replace(RELATIVE_TS, '$1.js$2');
}
