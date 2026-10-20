// The page inside the iframe of a live example. It runs one module at a time: the example as the site built it, or the code the reader
// has written, which the page sends. The frame is the only place example code runs, so a loop that never ends, a style or a global
// belongs to the frame and not to the documentation around it. It reports back its height, and any error.
//
// What it mounts with is the site's adapter (`docs-adapter` in the import map), so this file knows nothing of the library being shown.
import * as adapter from 'docs-adapter';

interface Message {
  docs: boolean;
  type: string;
  code?: string;
  value?: string;
}

const root = document.getElementById('root');
const id = location.hash.slice(1);
let unmount: (() => void) | undefined;
let generation = 0;

function post(message: { type: string; [key: string]: unknown }) {
  // The page that holds the frame is the same origin, and is the only one this talks to.
  parent.postMessage({ docs: true, id, ...message }, location.origin);
}

async function run(url: string) {
  const mine = ++generation;
  try {
    unmount?.();
    unmount = undefined;
    if (root) root.textContent = '';
    const module: unknown = await import(/* @vite-ignore */ url);
    // A newer run has started while this one was loading: it is the one to show.
    if (mine !== generation) return;
    if (root) unmount = adapter.mount(module, root);
    post({ type: 'ok' });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

const original = () => run(new URL(`./examples/${id}.js`, import.meta.url).href);

addEventListener('message', (event: MessageEvent<Message>) => {
  if (event.origin !== location.origin || event.source !== parent || !event.data?.docs) return;
  const { type, code, value } = event.data;
  if (type === 'original') void original();
  else if (type === 'run' && code !== undefined) {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    void run(url).finally(() => URL.revokeObjectURL(url));
  } else if (type === 'theme' && value) document.documentElement.dataset.theme = value;
});

addEventListener('error', (event) => post({ type: 'error', message: event.message }));
addEventListener('unhandledrejection', (event) =>
  post({ type: 'error', message: event.reason instanceof Error ? event.reason.message : String(event.reason) }),
);
new ResizeObserver(() => post({ type: 'height', height: document.body.offsetHeight })).observe(document.body);

void original();
