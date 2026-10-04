import { r as createElement, t as Fragment } from "./core-I_w9N2TI.mjs";
//#region src/pipis/jsx-runtime.ts
const jsx = (type, props) => typeof type === "string" ? createElement(type, props) : type(props);
const jsxs = jsx;
//#endregion
export { Fragment, jsx, jsxs };
