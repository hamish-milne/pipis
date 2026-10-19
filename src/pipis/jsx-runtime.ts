import { type JSXElement, type ChildrenProp, createElement, type CoreIntrinsicElements } from './core.ts';
export { Fragment } from './core.ts';

/** What a JSX tag names: a lowercase tag of an HTML or SVG element, or a component, which is a function from its props to an element. */
export type Component = keyof CoreIntrinsicElements | ((props: ChildrenProp) => JSXElement);

/** The type of a JSX `key`, which the compiler passes along. pipis has no `key` prop and ignores it: a changing list uses `List`. */
export type JSXKey = string | number | null;

/** What the compiler calls for a JSX element: makes the element for a tag, or calls the component with its props. */
export const jsx = (type: Component, props: ChildrenProp): JSXElement =>
  typeof type === 'string' ? createElement(type, props) : type(props);

/** What the compiler calls for an element whose children are all static. The same as {@link jsx}: pipis does not tell them apart. */
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
