import { jsx, type Component } from './jsx-runtime.ts';
import type { ChildrenProp } from './core.ts';
export { Fragment } from './core.ts';

export type SourceInfo = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
};

// TypeScript and Babel also pass the key, whether the children are static, the source location and `this`; pipis uses none of them.
export const jsxDEV = (type: Component, props: ChildrenProp) => jsx(type, props);
