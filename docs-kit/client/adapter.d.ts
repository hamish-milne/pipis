// The mount adapter is the site's own module, which the frame's import map names `docs-adapter`: it is not found by path, so its shape
// is declared here. See site/adapter.ts for the one that pipis uses.
declare module 'docs-adapter' {
  /** Runs an example's module in the container, and returns what stops it. */
  export function mount(module: unknown, container: HTMLElement): () => void;
}
