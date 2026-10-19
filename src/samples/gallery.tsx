/// <reference types="vite/client" />
/** @jsxRuntime automatic */
/** @jsxImportSource ../pipis */

import './styles.css';
import { reactive, select, Dynamic, type JSXElement } from '../pipis';
import { TodoApp } from './todo';
import { WeatherApp } from './weather';
import { FeedbackApp } from './feedback';

/** An `<a>` pointing at an API's (not yet written) docs entry, used inline within descriptions. */
function api(name: string): JSXElement {
  return (
    <a href="" className="font-medium text-indigo-300 underline decoration-dotted hover:text-indigo-200">
      {name}
    </a>
  );
}

type Example = {
  id: string;
  label: string;
  component: () => JSXElement;
  description: JSXElement;
};

const examples: Example[] = [
  {
    id: 'todo',
    label: 'Todo',
    component: TodoApp,
    description: (
      <p>
        A classic todo list. Demonstrates {api('reactive')} state holding an array, {api('select')} to derive per-row fields (so a row only
        updates when its own data changes, not when unrelated items change), and {api('List')} for keyed, reorderable rendering.
      </p>
    ),
  },
  {
    id: 'weather',
    label: 'Weather',
    component: WeatherApp,
    description: (
      <p>
        Fetches the local weather on load. Demonstrates {api('Suspense')} for pending/success/error states around a promise, {api('Watch')}{' '}
        for persisting a preference to storage as a side effect, and reactive {api('data-*')} attribute bindings driving Tailwind variants
        for the theme toggle.
      </p>
    ),
  },
  {
    id: 'feedback',
    label: 'Feedback',
    component: FeedbackApp,
    description: (
      <p>
        A feedback widget built to exercise the remaining API surface. Demonstrates array operations for a fixed-length star rating,{' '}
        {api('defineContext')} for passing an accent color down the tree, {api('PortalTarget')} and {api('Portal')} for rendering a modal
        elsewhere in the DOM, {api('If')} for conditionally showing that modal, a directly-passed reactive {api('ref')} to capture a DOM
        node, and {api('ErrorBoundary')} combined with {api('Dynamic')} to catch a crash on mount.
      </p>
    ),
  },
];

export function Gallery() {
  const selected = reactive(examples[0].id);
  const current = select(selected, (id) => examples.find((example) => example.id === id)!);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">pipis examples</h1>
          <nav className="flex gap-2">
            {examples.map((example) => {
              const isSelected = select(selected, (id) => id === example.id);
              const tabClass = select(
                isSelected,
                (active) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`,
              );
              return (
                <button onclick={() => (selected.value = example.id)} className={tabClass}>
                  {example.label}
                </button>
              );
            })}
          </nav>
          <div className="rounded-xl bg-slate-900/70 px-4 py-3 text-sm text-slate-400 ring-1 ring-white/10">
            <Dynamic value={current}>{(example) => example.description}</Dynamic>
          </div>
        </header>

        {/* Dynamic fully recreates the chosen example's DOM and state on every switch. */}
        <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
          <Dynamic value={current}>{(example) => example.component()}</Dynamic>
        </div>
      </div>
    </div>
  );
}

Gallery()(document.body);
