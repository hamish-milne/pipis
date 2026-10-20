// How the docs frame shows a pipis example: its default export is a component, which is called, and the element it returns is mounted
// into the frame's container. Calling the element with nothing unmounts it. This is the whole of what the docs kit knows of pipis.
export function mount(module: unknown, container: HTMLElement): () => void {
  const component = typeof module === 'object' && module !== null ? Reflect.get(module, 'default') : undefined;
  if (typeof component !== 'function') throw new Error('An example must have a default export: a component that takes no arguments.');
  const element: unknown = component();
  if (typeof element !== 'function') throw new Error('The component must return an element (JSX), not a ' + typeof element + '.');
  element(container);
  return () => element();
}
