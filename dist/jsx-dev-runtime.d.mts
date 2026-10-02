import { i as Fragment, o as JSXElement, t as ChildrenProp } from "./core-BV7038zv.mjs";
import { Component, JSXKey } from "./jsx-runtime.mjs";
//#region src/pipis/jsx-dev-runtime.d.ts
export type SourceInfo = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
};
export declare const jsxDEV: (type: Component, props: ChildrenProp, key?: JSXKey, isStaticChildren?: boolean, source?: SourceInfo, self?: any) => JSXElement;
//#endregion
export { Fragment };