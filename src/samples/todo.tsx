/// <reference types="vite/client" />
/** @jsxRuntime automatic */
/** @jsxImportSource ../pipis */

import "./styles.css";
import { reactive, select, List } from "../pipis";

type Todo = { id: number; text: string; done: boolean };

let nextId = 0;

export function TodoApp() {
  const todos = reactive<readonly Todo[]>([]);
  const draft = reactive("");

  function addTodo() {
    const text = draft.value.trim();
    if (!text) return;
    todos.value = [...todos.value, { id: nextId++, text, done: false }];
    draft.value = "";
  }

  function removeTodo(id: number) {
    todos.value = todos.value.filter((todo) => todo.id !== id);
  }

  function toggleTodo(id: number) {
    todos.value = todos.value.map((todo) =>
      todo.id === id ? { ...todo, done: !todo.done } : todo,
    );
  }

  function moveTodo(id: number, delta: number) {
    const list = todos.value;
    const from = list.findIndex((todo) => todo.id === id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= list.length) return;
    const next = list.slice();
    [next[from], next[to]] = [next[to], next[from]];
    todos.value = next;
  }

  function clearCompleted() {
    todos.value = todos.value.filter((todo) => !todo.done);
  }

  // Each row derives its own reactive fields by id, so it only updates when its own data changes.
  function todoRow(id: number) {
    const todo = select(todos, (list) => list.find((t) => t.id === id)!);
    const text = select(todo, "text");
    const done = select(todo, "done");

    return (
      <li className="group flex items-center gap-3 px-5 py-3 transition hover:bg-white/5">
        <button
          onclick={() => toggleTodo(id)}
          data-done={done}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] text-transparent transition group-hover:border-white/40 data-done:border-emerald-400 data-done:bg-emerald-400 data-done:text-slate-950"
        >
          ✓
        </button>
        <span
          data-done={done}
          className="flex-1 truncate text-sm text-slate-200 transition data-done:text-slate-500 data-done:line-through"
        >
          {text}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            onclick={() => moveTodo(id, -1)}
            title="Move up"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
          >
            ↑
          </button>
          <button
            onclick={() => moveTodo(id, 1)}
            title="Move down"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-white"
          >
            ↓
          </button>
          <button
            onclick={() => removeTodo(id)}
            title="Remove"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-rose-500/20 hover:text-rose-400"
          >
            ✕
          </button>
        </div>
      </li>
    );
  }

  const remaining = select(todos, (list) => list.filter((todo) => !todo.done).length);
  const hasCompleted = select(todos, (list) => list.some((todo) => todo.done));

  return (
    <div className="flex min-h-screen items-start justify-center bg-linear-to-br from-slate-950 via-indigo-950 to-slate-950 px-4 py-16">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-slate-900/70 shadow-2xl shadow-indigo-950/60 ring-1 ring-white/10 backdrop-blur-xl">
        <div className="border-b border-white/5 px-6 pb-4 pt-6">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Todo</h1>
          <p className="mt-1 text-sm text-slate-400">
            <span className="font-medium text-indigo-300">{remaining}</span> left to do
          </p>
        </div>

        <form
          className="flex gap-2 border-b border-white/5 px-6 py-4"
          onsubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
        >
          <input
            className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 transition placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="What needs doing?"
            value={draft}
            oninput={(e) => (draft.value = e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 active:bg-indigo-600"
          >
            Add
          </button>
        </form>

        <ul className="peer max-h-112 divide-y divide-white/5 overflow-y-auto empty:hidden">
          <List items={todos} itemKey={(todo) => todo.id}>
            {(todo) => todoRow(todo.id)}
          </List>
        </ul>
        <p className="hidden px-6 py-12 text-center text-sm text-slate-500 peer-empty:block">
          Nothing to do — enjoy the silence.
        </p>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-3 text-xs text-slate-500">
          <span>Use the arrows to reorder items.</span>
          <button
            onclick={clearCompleted}
            data-visible={hasCompleted}
            className="invisible rounded-md px-2 py-1 text-slate-400 transition hover:bg-white/5 hover:text-white data-visible:visible"
          >
            Clear completed
          </button>
        </div>
      </div>
    </div>
  );
}
