import {
  type JSXElement,
  type ChildrenProp,
  createElement,
  type CoreIntrinsicElements,
} from "./core";
export { Fragment } from "./core";

export type Component = keyof CoreIntrinsicElements | ((props: ChildrenProp) => JSXElement);

export type JSXKey = string | number | null;

export const jsx = (type: Component, props: ChildrenProp): JSXElement =>
  typeof type === "string" ? createElement(type, props) : type(props);

export const jsxs = jsx;

const PLACEHOLDER = Symbol();
// `declare global` is required so consumers get `JSX.IntrinsicElements` etc. even when their
// tsconfig/module resolution doesn't pick up this module's local types for `jsxImportSource`.
declare global {
  namespace JSX {
    type Element = JSXElement;
    type IntrinsicElements = CoreIntrinsicElements;
    interface IntrinsicAttributes {
      // Needed to properly type-check children
      readonly [PLACEHOLDER]?: unknown;
    }
  }
}
