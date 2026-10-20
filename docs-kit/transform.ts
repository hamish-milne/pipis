// The one transform an example goes through, at build time (the examples a page runs) and in the browser (the ones a reader edits), so
// an edited example behaves as the shipped one does. Sucrase strips the types and compiles JSX to the automatic runtime; the syntax it
// leaves alone is ES2022, which every browser the docs site supports reads.
import { transform } from 'sucrase';

/** TypeScript with JSX, as a module of plain JavaScript that imports its JSX runtime from `${jsxImportSource}/jsx-runtime`. */
export function toJs(code: string, jsxImportSource: string): string {
  return transform(code, {
    transforms: ['typescript', 'jsx'],
    jsxRuntime: 'automatic',
    jsxImportSource,
    disableESTransforms: true,
    production: true,
  }).code;
}
