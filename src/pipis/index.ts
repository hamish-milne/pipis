// The package's main entry point: everything an app imports from `pipis`. Each module is a layer an app opts into by importing it, and this
// is what puts them in one name; a bundler leaves out what is not used.
export * from './base.ts';
export * from './core.ts';
export * from './reactive.ts';
export * from './dynamic.ts';
// What the nodes are made with is the platform's. Of what it provides these are public, and the rest (the ways the library makes an element
// and sets its props) is not, which is why this is not `export *`.
export { IS_CLIENT, IS_HYDRATE, IS_SERVER, createMarker, textNode } from '#platform';
