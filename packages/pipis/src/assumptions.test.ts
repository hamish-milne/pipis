import { describe, expect, it } from 'vite-plus/test';
import { Fragment, textNode, type JSXElement, type Reactive } from './index.ts';
import { patch, reactive, select } from './reactive.ts';
import { If, List, OneOf, ReactiveList, Watch } from './dynamic.ts';
import { h, html, mount, tracked } from '../test/dom.ts';

/**
 * The design assumptions that docs/adr/ records, each with a test that could disprove it. Where another test file already covers
 * one, the ADR points there; these are the ones that need a scenario of their own.
 */

describe('ADR 1: a component runs once', () => {
  it('runs its body once, however often the state it displays changes', () => {
    let runs = 0;
    const Counter = () => {
      runs++;
      const n = reactive(0);
      return h(
        'button',
        { onclick: () => (n.value = n.value + 1) },
        select(n, (v) => `Clicked ${v} times`),
      );
    };
    const { root } = mount(Counter());
    const button = root.querySelector('button');
    for (let i = 0; i < 5; i++) button?.dispatchEvent(new MouseEvent('click'));
    expect(runs).toBe(1);
    expect(root.textContent).toBe('Clicked 5 times');
  });

  it('updates only the node that shows the changed value', () => {
    const name = reactive('a');
    const other = reactive('x');
    const { root } = mount(h('p', {}, h('b', {}, name), h('i', {}, other)));
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    name.value = 'b';
    const records = observer.takeRecords();
    observer.disconnect();
    expect(records).toHaveLength(1);
    expect(records[0]?.type).toBe('characterData');
    expect(root.textContent).toBe('bx');
  });
});

describe('ADR 4: List rows are plain items; rows that change read live data', () => {
  type Product = { id: number; name: string; quantity: number };
  const initial: readonly Product[] = [
    { id: 1, name: 'apple', quantity: 1 },
    { id: 2, name: 'pear', quantity: 2 },
    { id: 3, name: 'plum', quantity: 3 },
  ];

  function overIds(products: Reactive<readonly Product[]>, built: number[]) {
    const ids = select(products, (list) => list.map((p) => p.id));
    return List({
      items: ids,
      itemKey: (id) => id,
      children: (id) => {
        built.push(id);
        const placeholder: Product = { id, name: '', quantity: 0 };
        const row = select(products, (list) => list.find((p) => p.id === id) ?? placeholder);
        return h('li', {}, select(row, 'name'), ' x ', select(row, 'quantity'));
      },
    });
  }

  it('updates only the changed row, in place, when the list is over ids', () => {
    const products = reactive(initial);
    const built: number[] = [];
    const { root } = mount(overIds(products, built));
    const rows = [...root.querySelectorAll('li')];
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    products.value = products.value.map((p) => (p.id === 2 ? { ...p, quantity: 9 } : p));
    const records = observer.takeRecords();
    observer.disconnect();
    expect(html(root)).toBe('<li>apple x 1</li><li>pear x 9</li><li>plum x 3</li>');
    // One text node changed: no row was rebuilt, moved or removed.
    expect(records).toHaveLength(1);
    expect(built).toEqual([3, 2, 1]);
    expect([...root.querySelectorAll('li')]).toEqual(rows);
  });

  it('adds and removes only the rows that came or went', () => {
    const products = reactive(initial);
    const built: number[] = [];
    const { root } = mount(overIds(products, built));
    built.length = 0;
    products.value = [...initial.slice(1), { id: 4, name: 'fig', quantity: 4 }];
    expect(html(root)).toBe('<li>pear x 2</li><li>plum x 3</li><li>fig x 4</li>');
    expect(built).toEqual([4]);
  });

  // The pattern LLM.md warns against (mistake 11): the row function runs once per key, so what it captured is what it keeps.
  it('goes stale when the list is over the items themselves and a row reads the item it was given', () => {
    const products = reactive(initial);
    const { root } = mount(
      List({
        items: products,
        itemKey: (p) => p.id,
        children: (p) => h('li', {}, `${p.name} x ${p.quantity}`),
      }),
    );
    products.value = products.value.map((p) => (p.id === 2 ? { ...p, quantity: 9 } : p));
    expect(html(root)).toBe('<li>apple x 1</li><li>pear x 2</li><li>plum x 3</li>');
  });
});

describe('ADR 6: updates are synchronous and unbatched', () => {
  it('delivers each of many patches to its subscribers before the next one starts', () => {
    const state = reactive({ a: 0, b: 0 });
    const seen: number[] = [];
    state.subscribe((s) => seen.push(s.a));
    seen.length = 0;
    for (let i = 1; i <= 100; i++) patch(state, { a: i });
    // One notification per patch, in order: nothing is coalesced.
    expect(seen).toHaveLength(100);
    expect(seen[0]).toBe(1);
    expect(seen[99]).toBe(100);
  });

  it('has already updated the DOM when the assignment returns', () => {
    const n = reactive(0);
    const { root } = mount(h('p', {}, n));
    n.value = 7;
    expect(root.textContent).toBe('7');
  });
});

describe('ADR 11: mounting is idempotent, and unmounting leaves nothing behind', () => {
  /** A small deterministic generator, so a failure can be replayed: no `Math.random()` in tests. */
  function generator(seed: number) {
    let s = seed;
    return (n: number) => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return Math.floor((s / 4294967296) * n);
    };
  }

  type Inputs = {
    label: Reactive<string>;
    show: Reactive<boolean>;
    items: Reactive<readonly number[]>;
    /** The same ids, as items with a field that edits: what a ReactiveList is for. */
    rows: Reactive<readonly { id: number; text: string }[]>;
    view: Reactive<'x' | 'y'>;
  };

  /** A tree that uses every dynamic element, built over the given inputs. */
  function build({ label, show, items, rows, view }: Inputs): JSXElement {
    return h(
      'div',
      {},
      Watch({ value: label, children: () => {} }),
      h('h1', {}, label),
      If({
        condition: show,
        children: Fragment({
          children: [
            textNode('[if]'),
            List({
              items,
              itemKey: (n) => n,
              children: (n) => Fragment({ children: [textNode(`<${n}>`), h('i', {}, label)] }),
            }),
            ReactiveList({ items: rows, itemKey: (r) => r.id, children: (item) => h('em', {}, select(item, 'text')) }),
          ],
        }),
      }),
      OneOf({ selector: view, children: { x: h('b', {}, 'X'), y: Fragment({ children: [h('u', {}, 'Y'), textNode(' and ')] }) } }),
    );
  }

  it.each([1, 2, 3, 4, 5])(
    'stays equal to a freshly built tree through a random run of changes, unmounts and remounts (seed %i)',
    (seed) => {
      const next = generator(seed);
      const label = tracked('a');
      const show = tracked(true);
      const items = tracked<readonly number[]>([1, 2, 3]);
      const view = tracked<'x' | 'y'>('x');
      const rows = tracked<readonly { id: number; text: string }[]>([1, 2, 3].map((id) => ({ id, text: 'a' })));
      const all = [label, show, items, view, rows];
      const element = build({
        label: label.reactive,
        show: show.reactive,
        items: items.reactive,
        rows: rows.reactive,
        view: view.reactive,
      });
      const syncRows = () => {
        rows.state.value = items.state.value.map((id) => ({ id, text: label.state.value }));
      };

      const home = document.createElement('section');
      const elsewhere = document.createElement('article');
      document.body.append(home, elsewhere);
      let mounted: Element | undefined;
      const mountAt = (parent: Element) => {
        element(parent);
        mounted = parent;
      };
      mountAt(home);

      for (let step = 0; step < 300; step++) {
        const operation = next(8);
        if (operation === 0) {
          label.state.value = String.fromCharCode(97 + next(6));
          syncRows();
        } else if (operation === 1) show.state.value = !show.state.value;
        else if (operation === 2) {
          items.state.value = [1, 2, 3, 4, 5].filter(() => next(2) === 1).sort(() => next(3) - 1);
          syncRows();
        } else if (operation === 3) view.state.value = view.state.value === 'x' ? 'y' : 'x';
        else if (operation === 4) {
          element();
          mounted = undefined;
        } else if (operation === 5) mountAt(mounted === home ? elsewhere : home);
        else if (operation === 6 && mounted) mountAt(mounted); // again at the same place: must change nothing
        // operation 7: nothing, so runs of one kind are not forced.

        if (mounted) {
          const fresh = mount(build({ label: label.state, show: show.state, items: items.state, rows: rows.state, view: view.state }));
          expect(html(mounted), `step ${step}`).toBe(html(fresh.root));
          fresh.unmount();
          expect(
            all.map((r) => r.active > 0),
            `step ${step}: each input is listened to while mounted, and the items only while the If shows them`,
          ).toEqual([true, true, show.state.value, true, show.state.value]);
        } else {
          expect(html(home) + html(elsewhere), `step ${step}`).toBe('');
          expect(
            all.map((r) => r.active),
            `step ${step}: nothing is subscribed once unmounted`,
          ).toEqual([0, 0, 0, 0, 0]);
        }
      }
      element();
      expect(all.map((r) => r.active)).toEqual([0, 0, 0, 0, 0]);
    },
  );
});
