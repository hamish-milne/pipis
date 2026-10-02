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
export namespace JSX {
  export type Element = JSXElement;
  export type IntrinsicElements = CoreIntrinsicElements;
  export interface IntrinsicAttributes {
    // Needed to properly type-check children
    readonly [PLACEHOLDER]?: unknown;
  }
}
