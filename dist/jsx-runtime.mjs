import { r as createElement, t as Fragment } from "./core-BZx4Ut7Y.mjs";
//#region src/pipis/jsx-runtime.ts
const jsx = (type, props) => typeof type === "string" ? createElement(type, props) : type(props);
const jsxs = jsx;
//#endregion
export { Fragment, jsx, jsxs };
