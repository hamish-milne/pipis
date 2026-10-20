/** @jsxRuntime automatic */
/** @jsxImportSource ../src */

// An island as an app writes it: a component, which the page uses on the server and the browser's entry mounts. (packages/pipis/tools/server.test.ts renders a
// page with it on the server and mounts it in jsdom.)
import { reactive, select, type JSXElement } from '../src/index.ts';

export function Counter(props: { start: number; label: string }): JSXElement {
  const count = reactive(props.start);
  return (
    <button onclick={() => count.value++} data-label={props.label}>
      {select(count, (n) => `${props.label}: ${n}`)}
    </button>
  );
}

/** Every island of the page, by name: the browser's entry gives this to `mountIslands`. */
export const components = { counter: Counter };
