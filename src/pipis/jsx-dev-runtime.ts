import { jsx, type Component } from './jsx-runtime.ts';
import type { ChildrenProp } from './core.ts';
export { Fragment } from './core.ts';

/** Where a JSX element is in the source, which the compiler passes to {@link jsxDEV} in development. pipis does not use it. */
export type SourceInfo = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
};

// TypeScript and Babel also pass the key, whether the children are static, the source location and `this`; pipis uses none of them.
/** What the compiler calls for a JSX element in development: {@link jsx}, ignoring the extra arguments the compiler passes. */
export const jsxDEV = (type: Component, props: ChildrenProp, ..._unused: unknown[]) => jsx(type, props);
