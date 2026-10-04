import { a as Fragment, i as CoreIntrinsicElements, o as JSXElement, t as ChildrenProp } from "./core-BSwX5bom.mjs";
//#region src/pipis/jsx-runtime.d.ts
export type Component = keyof CoreIntrinsicElements | ((props: ChildrenProp) => JSXElement);
export type JSXKey = string | number | null;
export declare const jsx: (type: Component, props: ChildrenProp) => JSXElement;
export declare const jsxs: typeof jsx;
declare const PLACEHOLDER: unique symbol;
declare global {
  namespace JSX {
    type Element = JSXElement;
    type IntrinsicElements = CoreIntrinsicElements;
    interface IntrinsicAttributes {
      readonly [PLACEHOLDER]?: unknown;
    }
  }
}
//#endregion
export { Fragment };