// The benchmark programs, run in the page by tools/bench.ts. Each one builds what it measures outside the timed part, then times
// only the operation, so a number is the cost of that operation and nothing else.
import { If, List, ReactiveList, createElement, patch, reactive, select, type JSXElement, type Reactive, type ReactiveState } from 'pipis';

type Result = { name: string; unit: string; value: number; note: string };

type Row = { id: number; label: string; count: number };
const rowsOf = (n: number): readonly Row[] => Array.from({ length: n }, (_, id) => ({ id, label: `row ${id}`, count: 0 }));

/** A table of rows built the way LLM.md recommends: a list over ids, and each row selects its own data by id. */
function table(rows: ReactiveState<readonly Row[]>) {
  const ids = select(rows, (list) => list.map((r) => r.id));
  return List({
    items: ids,
    itemKey: (id) => id,
    children: (id) => {
      const row = select(rows, (list) => list.find((r) => r.id === id) ?? { id, label: '', count: 0 });
      return createElement('li', { children: [select(row, 'label'), ' ', select(row, (r) => String(r.count))] });
    },
  });
}

/** The same table as a ReactiveList: the list is the array of rows, and each row is given its item as a reactive value. */
function reactiveTable(rows: ReactiveState<readonly Row[]>) {
  return ReactiveList({
    items: rows,
    itemKey: (r) => r.id,
    children: (item) => createElement('li', { children: [select(item, 'label'), ' ', select(item, (r) => String(r.count))] }),
  });
}

const container = () => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

/** Median of `runs` timings of `fn`, in milliseconds. Each run gets a fresh `setup()`. */
function time<T>(runs: number, setup: () => T, fn: (state: T) => void): number {
  const samples: number[] = [];
  for (let i = 0; i < runs + 2; i++) {
    const state = setup();
    const start = performance.now();
    fn(state);
    const elapsed = performance.now() - start;
    // The first two runs warm the engine up and are not counted.
    if (i >= 2) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

export function run(): Result[] {
  const results: Result[] = [];
  const add = (name: string, unit: string, value: number, note = '') =>
    results.push({ name, unit, value: Math.round(value * 1000) / 1000, note });
  const N = 1000;

  // ---- lists
  add(
    `Create and mount a list of ${N} rows`,
    'ms',
    time(
      9,
      () => ({ rows: reactive(rowsOf(N)), el: container() }),
      ({ rows, el }) => {
        table(rows)(el);
        el.remove();
      },
    ),
    'each row has two bindings',
  );

  const listSetup = () => {
    const rows = reactive(rowsOf(N));
    const el = container();
    table(rows)(el);
    return { rows, el };
  };
  add(
    `Change one field of one row, in a list of ${N}`,
    'µs',
    (time(9, listSetup, ({ rows }) => {
      for (let i = 0; i < 100; i++) rows.value = rows.value.map((r) => (r.id === 500 ? { ...r, count: i + 1 } : r));
    }) /
      100) *
      1000,
    'includes rebuilding the row array, and every row re-running its select',
  );
  // The recommended pattern has every row search the whole array for its own data, so one change costs about rows x rows steps.
  for (const size of [100, 10_000]) {
    add(
      `Change one field of one row, in a list of ${size.toLocaleString('en')}`,
      'µs',
      (time(
        5,
        () => {
          const rows = reactive(rowsOf(size));
          table(rows)(container());
          return rows;
        },
        (rows) => {
          for (let i = 0; i < 5; i++) rows.value = rows.value.map((r) => (r.id === size / 2 ? { ...r, count: i + 1 } : r));
        },
      ) /
        5) *
        1000,
      'for comparison: grows with the square of the row count',
    );
  }
  for (const size of [100, 1000, 10_000]) {
    add(
      `ReactiveList: change one field of one row, in a list of ${size.toLocaleString('en')}`,
      'µs',
      (time(
        5,
        () => {
          const rows = reactive(rowsOf(size));
          reactiveTable(rows)(container());
          return rows;
        },
        (rows) => {
          for (let i = 0; i < 5; i++) rows.value = rows.value.map((r) => (r.id === size / 2 ? { ...r, count: i + 1 } : r));
        },
      ) /
        5) *
        1000,
      'one pass over the array; only the changed row recomputes',
    );
  }
  add(
    `Change one field of every row, in a list of ${N}`,
    'ms',
    time(9, listSetup, ({ rows }) => {
      rows.value = rows.value.map((r) => ({ ...r, count: r.count + 1 }));
    }),
    '',
  );
  add(
    `Reverse a list of ${N} rows`,
    'ms',
    time(9, listSetup, ({ rows }) => {
      rows.value = [...rows.value].reverse();
    }),
    'rows are moved, not rebuilt',
  );
  add(
    `Append one row to a list of ${N}`,
    'ms',
    time(9, listSetup, ({ rows }) => {
      rows.value = [...rows.value, { id: N, label: 'new', count: 0 }];
    }),
    '',
  );
  add(
    `Remove one row from the middle of a list of ${N}`,
    'ms',
    time(9, listSetup, ({ rows }) => {
      rows.value = rows.value.filter((r) => r.id !== 500);
    }),
    '',
  );

  const reactiveSetup = () => {
    const rows = reactive(rowsOf(N));
    reactiveTable(rows)(container());
    return rows;
  };
  add(
    `ReactiveList: create and mount a list of ${N} rows`,
    'ms',
    time(
      9,
      () => ({ rows: reactive(rowsOf(N)), el: container() }),
      ({ rows, el }) => {
        reactiveTable(rows)(el);
        el.remove();
      },
    ),
    'each row has two bindings',
  );
  add(
    `ReactiveList: change one field of every row, in a list of ${N}`,
    'ms',
    time(9, reactiveSetup, (rows) => {
      rows.value = rows.value.map((r) => ({ ...r, count: r.count + 1 }));
    }),
    '',
  );
  add(
    `ReactiveList: reverse a list of ${N} rows`,
    'ms',
    time(9, reactiveSetup, (rows) => {
      rows.value = [...rows.value].reverse();
    }),
    '',
  );
  add(
    `ReactiveList: append one row to a list of ${N}`,
    'ms',
    time(9, reactiveSetup, (rows) => {
      rows.value = [...rows.value, { id: N, label: 'new', count: 0 }];
    }),
    '',
  );
  add(
    `ReactiveList: remove one row from the middle of a list of ${N}`,
    'ms',
    time(9, reactiveSetup, (rows) => {
      rows.value = rows.value.filter((r) => r.id !== 500);
    }),
    '',
  );

  // ---- single bindings, to see what the machinery costs on top of the DOM write
  add(
    'Write a reactive value bound to a text node (100,000 writes)',
    'ns',
    (time(
      9,
      () => {
        const n = reactive(0);
        createElement('p', { children: [n as Reactive<number | string>] })(container());
        return n;
      },
      (n) => {
        for (let i = 1; i <= 100_000; i++) n.value = i;
      },
    ) /
      100_000) *
      1e6,
    'per write',
  );
  add(
    'The same text node written directly (100,000 writes)',
    'ns',
    (time(
      9,
      () => {
        const text = document.createTextNode('');
        container().append(text);
        return text;
      },
      (text) => {
        for (let i = 1; i <= 100_000; i++) text.data = String(i);
      },
    ) /
      100_000) *
      1e6,
    'per write, for scale',
  );
  add(
    'Write through a chain of 10 selects to a text node (10,000 writes)',
    'ns',
    (time(
      9,
      () => {
        const n = reactive(0);
        let chained: Reactive<number> = n;
        for (let i = 0; i < 10; i++) chained = select(chained, (v) => v + 1);
        createElement('p', { children: [chained] })(container());
        return n;
      },
      (n) => {
        for (let i = 1; i <= 10_000; i++) n.value = i;
      },
    ) /
      10_000) *
      1e6,
    'per write, through 10 select layers',
  );

  // ---- many updates, unbatched
  const stateSetup = () => {
    const state = reactive({ a: 0, b: 0, c: 0, d: 0, e: 0 });
    const el = container();
    const fields = ['a', 'b', 'c', 'd', 'e'] as const;
    createElement('p', { children: fields.map((f) => select(state, (s) => String(s[f]))) })(el);
    return state;
  };
  add(
    '1,000 patch calls on object state with 5 bound fields',
    'ms',
    time(9, stateSetup, (state) => {
      for (let i = 1; i <= 1000; i++) patch(state, { a: i });
    }),
    'each patch notifies at once; there is no batching',
  );
  add(
    '1,000 plain assignments of a new object, same state and bindings',
    'ms',
    time(9, stateSetup, (state) => {
      for (let i = 1; i <= 1000; i++) state.value = { ...state.value, a: i };
    }),
    'what patch costs on top is the deep merge',
  );
  add(
    '1,000 patch calls that each change all 5 fields',
    'ms',
    time(9, stateSetup, (state) => {
      for (let i = 1; i <= 1000; i++) patch(state, { a: i, b: i, c: i, d: i, e: i });
    }),
    '5 bindings updated per patch',
  );

  // ---- conditionals
  add(
    'Toggle an If with a small subtree (10,000 toggles)',
    'µs',
    (time(
      9,
      () => {
        const show = reactive(false);
        const child: JSXElement = createElement('div', {
          children: [createElement('span', { children: 'x' }), createElement('b', { children: 'y' })],
        });
        If({ condition: show, children: child })(container());
        return show;
      },
      (show) => {
        for (let i = 0; i < 10_000; i++) show.value = !show.value;
      },
    ) /
      10_000) *
      1000,
    'per toggle, the subtree is reused, not rebuilt',
  );
  return results;
}
