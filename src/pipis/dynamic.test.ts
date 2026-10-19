import { describe, expect, it } from 'vite-plus/test';
import { Fragment, moveNode, textNode, type JSXElement, type Reactive } from './core.ts';
import { reactive, select, withErrorHandler, type ReactiveState } from './reactive.ts';
import {
  Dynamic,
  ErrorBoundary,
  Helmet,
  If,
  List,
  OneOf,
  Portal,
  PortalTarget,
  Suspense,
  Watch,
  dynamic,
  effect,
  type PortalTargetValue,
} from './dynamic.ts';
import { h, html, mount, tracked } from '../test/dom.ts';

/** A promise that is settled by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets the promise callbacks that are already queued run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** An element that renders nothing but logs when it is mounted and unmounted, to count how often it is rebuilt. */
function logged(name: string, log: string[]): JSXElement {
  return effect(() => {
    log.push(`mount ${name}`);
    return () => {
      log.push(`unmount ${name}`);
    };
  });
}

describe('dynamic', () => {
  it('mounts once, and returns a marker that stays the head', () => {
    let mounts = 0;
    const element = dynamic(
      (parent, sibling) => {
        mounts++;
        parent.insertBefore(document.createTextNode('x'), sibling);
      },
      () => {},
    );
    const root = document.createElement('div');
    const head = element(root);
    expect(head?.nodeType).toBe(Node.COMMENT_NODE);
    element(root);
    element(root, null);
    expect(mounts).toBe(1);
    expect(root.firstChild).toBe(head);
  });

  it('mounts again when the sibling changes, after undoing the first mount', () => {
    const calls: string[] = [];
    const element = dynamic(
      () => {
        calls.push('mount');
        return () => calls.push('cleanup');
      },
      () => calls.push('unmount'),
    );
    const root = document.createElement('div');
    const later = document.createTextNode('later');
    root.append(later);
    element(root, null);
    element(root, later);
    expect(calls).toEqual(['mount', 'cleanup', 'mount']);
  });

  it('runs the cleanup of its mount function, then its own unmount, on unmount', () => {
    const calls: string[] = [];
    const element = dynamic(
      () => () => calls.push('cleanup'),
      () => calls.push('unmount'),
    );
    const { root, unmount } = mount(element);
    unmount();
    expect(calls).toEqual(['cleanup', 'unmount']);
    expect(root.childNodes).toHaveLength(0);
  });
});

describe('List', () => {
  function numbers(items: Reactive<readonly number[]>, built: number[] = []) {
    return List({
      items,
      itemKey: (n) => n,
      children: (n) => {
        built.push(n);
        return h('li', {}, String(n));
      },
    });
  }

  it('renders the items in order', () => {
    const { root } = mount(numbers(reactive([1, 2, 3])));
    expect(html(root)).toBe('<li>1</li><li>2</li><li>3</li>');
  });

  it('renders nothing for an empty list, and fills in when items arrive', () => {
    const items = reactive<readonly number[]>([]);
    const { root } = mount(numbers(items));
    expect(html(root)).toBe('');
    items.value = [1, 2];
    expect(html(root)).toBe('<li>1</li><li>2</li>');
  });

  it('builds each row once per key, however often the list changes', () => {
    const items = reactive<readonly number[]>([1, 2]);
    const built: number[] = [];
    mount(numbers(items, built));
    items.value = [1, 2, 3];
    items.value = [3, 2, 1];
    items.value = [2, 3];
    expect(built).toEqual([2, 1, 3]);
  });

  it('keeps the same row nodes when the list is reordered', () => {
    const items = reactive<readonly number[]>([1, 2, 3]);
    const { root } = mount(numbers(items));
    const before = new Map([...root.querySelectorAll('li')].map((li) => [li.textContent, li]));
    items.value = [3, 1, 2];
    const after = [...root.querySelectorAll('li')];
    expect(after.map((li) => li.textContent)).toEqual(['3', '1', '2']);
    for (const li of after) expect(li).toBe(before.get(li.textContent));
  });

  it('adds and removes rows without touching the others', () => {
    const items = reactive<readonly number[]>([1, 2, 3]);
    const { root } = mount(numbers(items));
    const [one, two] = root.querySelectorAll('li');
    const observer = new MutationObserver(() => {});
    observer.observe(root, { childList: true, subtree: true });
    items.value = [1, 2, 3, 4];
    items.value = [2, 3, 4];
    const removed = observer.takeRecords().flatMap((record) => [...record.removedNodes]);
    observer.disconnect();
    // Only the row for 1 left the DOM; the rest were not taken out and put back. (Its own text goes with it, which is not a row.)
    expect(removed.filter((node) => node instanceof Element)).toEqual([one]);
    expect(root.querySelectorAll('li')[0]).toBe(two);
  });

  it('renders between the siblings around it', () => {
    const { root } = mount(h('ul', {}, h('b', {}, 'head'), numbers(reactive([1, 2])), h('b', {}, 'tail')));
    expect(html(root)).toBe('<ul><b>head</b><li>1</li><li>2</li><b>tail</b></ul>');
  });

  it('passes the item and its index to the row and key functions', () => {
    const seen: string[] = [];
    mount(
      List({
        items: reactive(['a', 'b']),
        itemKey: (item, index) => {
          seen.push(`key ${item}${index}`);
          return item;
        },
        children: (item, index) => {
          seen.push(`row ${item}${index}`);
          return textNode(item);
        },
      }),
    );
    expect(seen).toEqual(['key a0', 'key b1', 'row b1', 'row a0']);
  });

  it('removes its rows on unmount, and shows the current items when remounted', () => {
    const items = reactive<readonly number[]>([1, 2]);
    const element = numbers(items);
    const { root, unmount } = mount(element);
    unmount();
    expect(html(root)).toBe('');
    items.value = [5, 6, 7];
    element(root);
    expect(html(root)).toBe('<li>5</li><li>6</li><li>7</li>');
  });

  it('stops listening to its items on unmount', () => {
    const items = tracked<readonly number[]>([1]);
    const { unmount } = mount(numbers(items.reactive));
    expect(items.active).toBe(1);
    unmount();
    expect(items.active).toBe(0);
  });

  it('unmounts a row that leaves the list, so its cleanup runs', () => {
    const items = reactive<readonly number[]>([1, 2]);
    const log: string[] = [];
    mount(
      List({
        items,
        itemKey: (n) => n,
        children: (n) => Fragment({ children: [logged(`row ${n}`, log), textNode(String(n))] }),
      }),
    );
    log.length = 0;
    items.value = [2];
    expect(log).toEqual(['unmount row 1']);
  });

  it('builds a new row when a key that left comes back', () => {
    const items = reactive<readonly number[]>([1]);
    const built: number[] = [];
    mount(numbers(items, built));
    items.value = [];
    items.value = [1];
    expect(built).toEqual([1, 1]);
  });

  it('unsubscribes a removed row’s bindings, so a long-lived list does not leak', () => {
    const items = reactive<readonly number[]>([1, 2]);
    const label = tracked('x');
    mount(
      List({
        items,
        itemKey: (n) => n,
        children: () => h('li', {}, label.reactive),
      }),
    );
    expect(label.active).toBe(2);
    items.value = [1];
    expect(label.active).toBe(1);
  });
});

describe('OneOf', () => {
  function views(selector: Reactive<string>, built: string[] = []) {
    const view = (name: string) => {
      built.push(name);
      return h('p', {}, name);
    };
    return OneOf({ selector, children: { a: view('a'), b: view('b') } });
  }

  it('shows the child that matches the selector', () => {
    const { root } = mount(views(reactive('a')));
    expect(html(root)).toBe('<p>a</p>');
  });

  it('switches, removing the previous child', () => {
    const selector = reactive('a');
    const { root } = mount(views(selector));
    selector.value = 'b';
    expect(html(root)).toBe('<p>b</p>');
    selector.value = 'a';
    expect(html(root)).toBe('<p>a</p>');
  });

  it('shows nothing for a key it has no child for', () => {
    const selector = reactive('a');
    const { root } = mount(views(selector));
    selector.value = 'zzz';
    expect(html(root)).toBe('');
  });

  it('keeps one node per child, so switching back reuses it', () => {
    const selector = reactive('a');
    const { root } = mount(views(selector));
    const first = root.querySelector('p');
    selector.value = 'b';
    selector.value = 'a';
    expect(root.querySelector('p')).toBe(first);
  });

  it('runs a child’s cleanup when it is switched away from', () => {
    const selector = reactive('a');
    const log: string[] = [];
    mount(OneOf({ selector, children: { a: logged('a', log), b: logged('b', log) } }));
    selector.value = 'b';
    expect(log).toEqual(['mount a', 'unmount a', 'mount b']);
  });

  it('unmounts the current child and stops listening on unmount', () => {
    const selector = tracked('a');
    const { root, unmount } = mount(views(selector.reactive));
    unmount();
    expect(selector.active).toBe(0);
    expect(html(root)).toBe('');
  });
});

describe('If', () => {
  it('renders its children only while the condition is true', () => {
    const show = reactive(false);
    const { root } = mount(If({ condition: show, children: h('p', {}, 'yes') }));
    expect(html(root)).toBe('');
    show.value = true;
    expect(html(root)).toBe('<p>yes</p>');
    show.value = false;
    expect(html(root)).toBe('');
  });

  it('renders at once when the condition starts true', () => {
    const { root } = mount(If({ condition: reactive(true), children: h('p', {}, 'yes') }));
    expect(html(root)).toBe('<p>yes</p>');
  });

  it('keeps the same child nodes across toggles', () => {
    const show = reactive(true);
    const { root } = mount(If({ condition: show, children: h('p', {}, 'yes') }));
    const first = root.querySelector('p');
    show.value = false;
    show.value = true;
    expect(root.querySelector('p')).toBe(first);
  });

  it('accepts several children, and renders them where the If is', () => {
    const show = reactive(true);
    const { root } = mount(h('div', {}, 'a', If({ condition: show, children: [h('i', {}, 'b'), h('i', {}, 'c')] }), 'd'));
    expect(html(root)).toBe('<div>a<i>b</i><i>c</i>d</div>');
    show.value = false;
    expect(html(root)).toBe('<div>ad</div>');
  });

  it('runs the cleanup of its children when the condition turns false, and again each time it turns true', () => {
    const show = reactive(true);
    const log: string[] = [];
    mount(If({ condition: show, children: logged('child', log) }));
    show.value = false;
    show.value = true;
    expect(log).toEqual(['mount child', 'unmount child', 'mount child']);
  });

  it('unmounts the children and stops listening on unmount', () => {
    const show = tracked(true);
    const log: string[] = [];
    const { unmount } = mount(If({ condition: show.reactive, children: logged('child', log) }));
    unmount();
    expect(show.active).toBe(0);
    expect(log).toEqual(['mount child', 'unmount child']);
  });

  it('does not run the children’s mount a second time for a condition that is already true', () => {
    const show = reactive(true);
    const log: string[] = [];
    mount(If({ condition: show, children: logged('child', log) }));
    show.value = true;
    expect(log).toEqual(['mount child']);
  });
});

describe('position', () => {
  it('puts a OneOf between its siblings', () => {
    const { root } = mount(h('div', {}, 'a', OneOf({ selector: reactive('x'), children: { x: h('i', {}, 'b') } }), 'c'));
    expect(html(root)).toBe('<div>a<i>b</i>c</div>');
  });

  it('puts a Dynamic between its siblings', () => {
    const { root } = mount(h('div', {}, 'a', Dynamic({ value: reactive('b'), children: (v) => h('i', {}, v) }), 'c'));
    expect(html(root)).toBe('<div>a<i>b</i>c</div>');
  });

  it('puts an If between its siblings, whether it starts true or false', () => {
    for (const start of [true, false]) {
      const show = reactive(start);
      const { root } = mount(h('div', {}, 'a', If({ condition: show, children: h('i', {}, 'b') }), 'c'));
      show.value = true;
      expect(html(root)).toBe('<div>a<i>b</i>c</div>');
    }
  });
});

describe('Dynamic', () => {
  it('builds its content from the value, and rebuilds it on every change', () => {
    const value = reactive('a');
    let built = 0;
    const { root } = mount(
      Dynamic({
        value,
        children: (v) => {
          built++;
          return h('span', {}, v);
        },
      }),
    );
    expect(html(root)).toBe('<span>a</span>');
    value.value = 'b';
    expect(html(root)).toBe('<span>b</span>');
    expect(built).toBe(2);
  });

  it('replaces the old DOM rather than updating it', () => {
    const value = reactive('a');
    const { root } = mount(Dynamic({ value, children: (v) => h('span', {}, v) }));
    const first = root.querySelector('span');
    value.value = 'b';
    expect(root.querySelector('span')).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });

  it('runs the cleanup of what it replaces, and of the last content on unmount', () => {
    const value = reactive('a');
    const log: string[] = [];
    const { unmount } = mount(Dynamic({ value, children: (v) => logged(v, log) }));
    value.value = 'b';
    unmount();
    expect(log).toEqual(['mount a', 'unmount a', 'mount b', 'unmount b']);
  });

  it('stops listening on unmount', () => {
    const value = tracked('a');
    const { unmount } = mount(Dynamic({ value: value.reactive, children: (v) => textNode(v) }));
    unmount();
    expect(value.active).toBe(0);
  });
});

describe('effect and Effect', () => {
  it('runs on mount, not before, and runs its cleanup on unmount', () => {
    const log: string[] = [];
    const element = logged('e', log);
    expect(log).toEqual([]);
    const { unmount } = mount(element);
    expect(log).toEqual(['mount e']);
    unmount();
    expect(log).toEqual(['mount e', 'unmount e']);
  });

  it('renders nothing, and passes the sibling through', () => {
    const element = effect(() => undefined);
    const sibling = document.createTextNode('s');
    expect(element(document.createElement('div'), sibling)).toBe(sibling);
  });

  it('runs once however often it is mounted at the same place', () => {
    const log: string[] = [];
    const element = logged('e', log);
    const root = document.createElement('div');
    element(root);
    element(root);
    expect(log).toEqual(['mount e']);
  });

  it('runs again on remount', () => {
    const log: string[] = [];
    const element = logged('e', log);
    const { root, unmount } = mount(element);
    unmount();
    element(root);
    expect(log).toEqual(['mount e', 'unmount e', 'mount e']);
  });

  it('reports an error it throws to the error handler instead of throwing', () => {
    const seen: unknown[] = [];
    const boom = new Error('boom');
    const element = effect(() => {
      throw boom;
    });
    withErrorHandler(
      (e) => seen.push(e),
      () => element(document.createElement('div')),
    );
    // The handler is the one current when the error is thrown, which is when it is mounted here.
    expect(seen).toEqual([boom]);
  });

  // LLM.md mistake 6: children mount right to left, so a node that is after the effect is already attached when it runs.
  it('runs after the siblings that follow it, so as the first child it can use their nodes', () => {
    let attached: boolean | undefined;
    let input: Node | undefined;
    const { root } = mount(
      h(
        'div',
        {},
        effect(() => {
          attached = input?.isConnected;
          return undefined;
        }),
        h('input', { ref: (n: Node) => (input = n) }),
      ),
    );
    expect(root.querySelector('input')).toBe(input);
    expect(attached).toBe(true);
  });

  it('runs before the siblings that precede it, so as the last child it cannot', () => {
    let attached: boolean | undefined;
    let input: Node | undefined;
    mount(
      h(
        'div',
        {},
        h('input', { ref: (n: Node) => (input = n) }),
        effect(() => {
          attached = input?.isConnected;
          return undefined;
        }),
      ),
    );
    expect(attached).toBe(false);
  });

  it('runs its cleanup when the element it is inside is unmounted', () => {
    const log: string[] = [];
    const { unmount } = mount(h('div', {}, logged('inside', log)));
    unmount();
    expect(log).toEqual(['mount inside', 'unmount inside']);
  });

  // An effect that returns no cleanup is run again whenever its parent is mounted again with it, because the guard is the
  // cleanup itself. A List does that to every row on every update.
  it('does not run again when a list that holds it updates, even if it returns no cleanup', () => {
    const items = reactive<readonly number[]>([1, 2]);
    let runs = 0;
    mount(
      List({
        items,
        itemKey: (n) => n,
        children: (n) =>
          Fragment({
            children: [
              effect(() => {
                runs++;
                return undefined;
              }),
              textNode(String(n)),
            ],
          }),
      }),
    );
    expect(runs).toBe(2);
    items.value = [1, 2, 3];
    // One run for the new row, none for the two that were already mounted.
    expect(runs).toBe(3);
  });
});

describe('Watch', () => {
  it('runs with the current value on mount, then on every change', () => {
    const value = reactive(1);
    const seen: number[] = [];
    mount(Watch({ value, children: (v) => seen.push(v) }));
    value.value = 2;
    value.value = 3;
    expect(seen).toEqual([1, 2, 3]);
  });

  it('does not run before it is mounted, and stops after unmount', () => {
    const value = tracked(1);
    const seen: number[] = [];
    const element = Watch({ value: value.reactive, children: (v) => seen.push(v) });
    expect(seen).toEqual([]);
    const { unmount } = mount(element);
    unmount();
    value.state.value = 2;
    expect(seen).toEqual([1]);
    expect(value.active).toBe(0);
  });

  it('runs again with the current value when remounted', () => {
    const value = reactive(1);
    const seen: number[] = [];
    const element = Watch({ value, children: (v) => seen.push(v) });
    const { root, unmount } = mount(element);
    unmount();
    value.value = 2;
    element(root);
    expect(seen).toEqual([1, 2]);
  });

  it('keeps watching after the callback throws', () => {
    const value = reactive(0);
    const seen: number[] = [];
    withErrorHandler(
      () => {},
      () =>
        mount(
          Watch({
            value,
            children: (v) => {
              seen.push(v);
              if (v === 1) throw new Error('boom');
            },
          }),
        ),
    );
    withErrorHandler(
      () => {},
      () => {
        value.value = 1;
        value.value = 2;
      },
    );
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe('Portal and PortalTarget', () => {
  /** A target with nothing after it, which is the only place a dynamic element is positioned correctly today (see `siblingBug`). */
  function layout(target: ReactiveState<PortalTargetValue>, portals: JSXElement[]) {
    return mount(h('div', {}, h('main', {}, ...portals), h('aside', {}, 'before', PortalTarget({ ref: target }))));
  }

  it('renders its children at the position of the target', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const { root } = layout(target, [Portal({ target, children: h('b', {}, 'moved') })]);
    expect(html(root)).toBe('<div><main></main><aside>before<b>moved</b></aside></div>');
  });

  it('renders nothing until the target exists, then renders once it does', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const portal = Portal({ target, children: h('b', {}, 'moved') });
    const { root } = mount(portal);
    expect(html(root)).toBe('');
    const place = document.createElement('section');
    target.value = [place, null];
    expect(html(place)).toBe('<b>moved</b>');
  });

  it('records its parent and sibling while it is mounted, and clears them on unmount', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const { root, unmount } = mount(PortalTarget({ ref: target }));
    expect(target.value?.[0]).toBe(root);
    expect(target.value?.[1]).toBeNull();
    unmount();
    expect(target.value).toBeUndefined();
  });

  it('inserts several portals into one target in the order they were mounted', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const { root } = layout(target, [Portal({ target, children: h('b', {}, '1') }), Portal({ target, children: h('b', {}, '2') })]);
    // Siblings mount right to left, so the second portal subscribes to the target first and its content goes in first.
    expect(html(root.querySelector('aside') ?? root)).toBe('before<b>2</b><b>1</b>');
  });

  it('stops listening to the target when it is unmounted', () => {
    const target = tracked<PortalTargetValue>(undefined);
    const { unmount } = mount(Portal({ target: target.reactive, children: h('b', {}, 'moved') }));
    expect(target.active).toBe(1);
    unmount();
    expect(target.active).toBe(0);
  });

  // Its cleanup only unsubscribes from the target; what it rendered there is never unmounted, so the content outlives the Portal.
  it('removes what it rendered from the target when it is unmounted', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const place = document.createElement('section');
    const { unmount } = mount(Portal({ target, children: h('b', {}, 'moved') }));
    target.value = [place, null];
    expect(html(place)).toBe('<b>moved</b>');
    unmount();
    expect(html(place)).toBe('');
  });

  it('renders its target in place when something follows it', () => {
    const target = reactive<PortalTargetValue>(undefined);
    const { root } = mount(h('aside', {}, 'before', PortalTarget({ ref: target }), 'after'));
    const [parent, sibling] = target.value ?? [];
    expect(parent).toBe(root.querySelector('aside'));
    expect(sibling?.textContent).toBe('after');
    expect(root.textContent).toBe('beforeafter');
  });
});

describe('Helmet', () => {
  it('renders its children into the document head, before what is already there', () => {
    const existing = document.head.firstChild;
    const { unmount } = mount(Helmet({ children: h('meta', { name: 'x' }) }));
    try {
      expect(document.head.firstChild).not.toBe(existing);
      expect(document.head.querySelector('meta[name="x"]')).not.toBeNull();
    } finally {
      unmount();
    }
  });

  it('removes them on unmount, and does not add them twice when mounted twice', () => {
    const element = Helmet({ children: h('meta', { name: 'y' }) });
    const { root, unmount } = mount(element);
    element(root);
    expect(document.head.querySelectorAll('meta[name="y"]')).toHaveLength(1);
    unmount();
    expect(document.head.querySelector('meta[name="y"]')).toBeNull();
  });

  it('puts nothing in the place it is mounted at', () => {
    const element = Helmet({ children: h('meta', { name: 'z' }) });
    const { root, unmount } = mount(h('div', {}, 'a', element, 'b'));
    try {
      expect(html(root)).toBe('<div>ab</div>');
    } finally {
      unmount();
    }
  });
});

describe('Suspense', () => {
  function view<T>(promise: (() => Promise<T>) | Reactive<Promise<T>>, emptyData: T, extra: Record<string, unknown> = {}) {
    return Suspense<T>({
      promise,
      emptyData,
      loading: h('i', {}, 'loading'),
      error: (e) =>
        h(
          'b',
          {},
          select(e, (x) => `failed: ${String(x)}`),
        ),
      children: (data) =>
        h(
          'p',
          {},
          select(data, (x) => String(x)),
        ),
      ...extra,
    });
  }

  it('shows the loading element while the promise is pending, then the data', async () => {
    const d = deferred<string>();
    const { root } = mount(view(() => d.promise, ''));
    expect(html(root)).toBe('<i>loading</i>');
    d.resolve('hello');
    await flush();
    expect(html(root)).toBe('<p>hello</p>');
  });

  it('shows the error element when the promise rejects', async () => {
    const d = deferred<string>();
    const { root } = mount(view(() => d.promise, ''));
    d.reject('nope');
    await flush();
    expect(html(root)).toBe('<b>failed: nope</b>');
  });

  it('renders the children with the empty data while pending when there is no loading element', () => {
    const d = deferred<string>();
    const { root } = mount(
      Suspense({
        promise: () => d.promise,
        emptyData: 'empty',
        children: (data) => h('p', {}, select(data, String)),
      }),
    );
    expect(html(root)).toBe('<p>empty</p>');
  });

  it('calls a promise function once, on mount', () => {
    let calls = 0;
    const element = view(() => {
      calls++;
      return new Promise<string>(() => {});
    }, '');
    expect(calls).toBe(0);
    mount(element);
    expect(calls).toBe(1);
  });

  it('goes back to loading and then shows the new data when a reactive promise is reassigned', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const promise = reactive(first.promise);
    const { root } = mount(view(promise, ''));
    first.resolve('one');
    await flush();
    expect(html(root)).toBe('<p>one</p>');
    promise.value = second.promise;
    expect(html(root)).toBe('<i>loading</i>');
    second.resolve('two');
    await flush();
    expect(html(root)).toBe('<p>two</p>');
  });

  it('shows a rejection that follows a success, and a success that follows a rejection', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const promise = reactive(first.promise);
    const { root } = mount(view(promise, ''));
    first.reject('bad');
    await flush();
    expect(html(root)).toBe('<b>failed: bad</b>');
    promise.value = second.promise;
    second.resolve('fine');
    await flush();
    expect(html(root)).toBe('<p>fine</p>');
  });

  // Decision 5: the latest promise wins. Today a slow older promise that settles last overwrites the newer result.
  it('shows the latest promise’s result even when an older one settles after it', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const promise = reactive(slow.promise);
    const { root } = mount(view(promise, ''));
    promise.value = fast.promise;
    fast.resolve('fast-new');
    await flush();
    slow.resolve('slow-old');
    await flush();
    expect(html(root)).toBe('<p>fast-new</p>');
  });

  it('does nothing visible when the promise settles after unmount', async () => {
    const d = deferred<string>();
    const { root, unmount } = mount(view(() => d.promise, ''));
    unmount();
    d.resolve('late');
    await flush();
    expect(html(root)).toBe('');
  });
});

describe('ErrorBoundary', () => {
  /** A child that fails as it mounts. It can still be unmounted, which the boundary does when it swaps in the fallback. */
  const Thrower =
    (): JSXElement =>
    (parent, sibling = null) => {
      if (parent) throw new Error('boom');
      return sibling;
    };
  const message = (error: Reactive<unknown>) => select(error, (e) => (e instanceof Error ? e.message : String(e)));

  it('renders its children when nothing throws', () => {
    const { root } = mount(ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: h('p', {}, 'fine') }));
    expect(html(root)).toBe('<p>fine</p>');
  });

  it('renders the fallback when a child throws on mount', () => {
    const { root } = mount(ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: Thrower() }));
    expect(root.textContent).toBe('FALLBACK');
  });

  it('gives the fallback the error', () => {
    const { root } = mount(ErrorBoundary({ fallback: (error) => h('p', {}, message(error)), children: Thrower() }));
    expect(root.textContent).toBe('boom');
  });

  it('catches an error thrown at any depth under it', () => {
    const { root } = mount(ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: h('div', {}, h('section', {}, Thrower())) }));
    expect(root.textContent).toBe('FALLBACK');
  });

  it('unmounts the children that had mounted before the throw', () => {
    const log: string[] = [];
    const { root } = mount(ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: [Thrower(), logged('first', log)] }));
    expect(html(root)).toBe('<p>FALLBACK</p>');
    expect(log).toEqual(['mount first', 'unmount first']);
  });

  // Decision 3: an error from a subscriber that runs later reaches the boundary too, and this is the common case.
  it('renders the fallback when a Watch under it throws on a later change', () => {
    const value = reactive(0);
    const { root } = mount(
      ErrorBoundary({
        fallback: () => h('p', {}, 'FALLBACK'),
        children: Watch({
          value,
          children: (v) => {
            if (v === 1) throw new Error('later');
          },
        }),
      }),
    );
    expect(root.textContent).toBe('');
    value.value = 1;
    expect(root.textContent).toBe('FALLBACK');
  });

  it('renders the fallback when a select function under it throws on a later change', () => {
    const value = reactive(0);
    const { root } = mount(
      ErrorBoundary({
        fallback: (error) => h('p', {}, message(error)),
        children: h(
          'p',
          {},
          select(value, (v) => {
            if (v === 1) throw new Error('bad select');
            return String(v);
          }),
        ),
      }),
    );
    expect(root.textContent).toBe('0');
    value.value = 1;
    expect(root.textContent).toBe('bad select');
  });

  it('renders the fallback when an Effect body under it throws', () => {
    const { root } = mount(
      ErrorBoundary({
        fallback: () => h('p', {}, 'FALLBACK'),
        children: effect(() => {
          throw new Error('effect failed');
        }),
      }),
    );
    expect(root.textContent).toBe('FALLBACK');
  });

  it('renders the fallback when a List row function under it throws on a later change', () => {
    const items = reactive<readonly number[]>([1]);
    const { root } = mount(
      ErrorBoundary({
        fallback: () => h('p', {}, 'FALLBACK'),
        children: List({
          items,
          itemKey: (n) => n,
          children: (n) => {
            if (n === 2) throw new Error('bad row');
            return textNode(String(n));
          },
        }),
      }),
    );
    expect(root.textContent).toBe('1');
    items.value = [1, 2];
    expect(root.textContent).toBe('FALLBACK');
  });

  it('lets the nearest boundary catch the error, not the outer one', () => {
    const { root } = mount(
      ErrorBoundary({
        fallback: () => h('p', {}, 'OUTER'),
        children: ErrorBoundary({ fallback: () => h('p', {}, 'INNER'), children: Thrower() }),
      }),
    );
    expect(root.textContent).toBe('INNER');
  });

  it('passes an error from its own fallback to the boundary outside it', () => {
    const { root } = mount(
      ErrorBoundary({
        fallback: () => h('p', {}, 'OUTER'),
        children: ErrorBoundary({ fallback: () => Thrower(), children: Thrower() }),
      }),
    );
    expect(root.textContent).toBe('OUTER');
  });

  it('passes an error from its own fallback to the handler outside it when there is no outer boundary', () => {
    const seen: unknown[] = [];
    withErrorHandler(
      (e) => seen.push(e),
      () => mount(ErrorBoundary({ fallback: () => Thrower(), children: Thrower() })),
    );
    expect(seen).toHaveLength(1);
  });

  it('does not catch an error outside it', () => {
    const seen: unknown[] = [];
    const value = reactive(0);
    const { root } = withErrorHandler(
      (e) => seen.push(e),
      () =>
        mount(
          h(
            'div',
            {},
            ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: h('b', {}, 'inside') }),
            Watch({
              value,
              children: (v) => {
                if (v === 1) throw new Error('outside');
              },
            }),
          ),
        ),
    );
    value.value = 1;
    expect(root.textContent).toBe('inside');
    expect(seen).toHaveLength(1);
  });

  it('unmounts cleanly and stops listening', () => {
    const { root, unmount } = mount(ErrorBoundary({ fallback: () => h('p', {}, 'FALLBACK'), children: h('p', {}, 'fine') }));
    unmount();
    expect(html(root)).toBe('');
  });
});

describe('moveNode used by an element of your own', () => {
  it('keeps a custom element in place across repeated mounts', () => {
    const node = document.createTextNode('x');
    const custom: JSXElement = (parent, sibling = null) => {
      moveNode(node, parent, sibling);
      return parent ? node : sibling;
    };
    const { root } = mount(custom);
    custom(root);
    expect(root.textContent).toBe('x');
    expect(root.childNodes).toHaveLength(1);
  });
});
