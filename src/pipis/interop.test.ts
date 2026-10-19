import { describe, expect, it } from 'vite-plus/test';
import { createStore } from 'zustand/vanilla';
import { legacy_createStore as createReduxStore } from 'redux';
import { BehaviorSubject, ReplaySubject, Subject, map } from 'rxjs';
import { writable } from 'svelte/store';
import { atom } from 'nanostores';
import { signal } from '@preact/signals-core';
import { assign, createActor, createMachine } from 'xstate';
import { proxy, snapshot, subscribe as valtioSubscribe } from 'valtio/vanilla';
import { atom as jotaiAtom, createStore as createJotaiStore } from 'jotai/vanilla';
import { isReactive, type Reactive } from './core.ts';
import { adapt, select } from './reactive.ts';
import { h, mount } from '../test/dom.ts';

/**
 * `adapt` turns a store, signal or Observable from another library into a Reactive. Each of these libraries is run for real, and
 * each gets the same checks: it shows the current value at once, including one set before it was mounted; it follows changes; and
 * nothing is left subscribed after unmount. The three shapes `subscribe` takes are all here:
 *
 * - gives the current value and returns a cleanup function (Svelte, Nanostores, Preact Signals): `adapt(source)`
 * - gives the current value and returns a Subscription (RxJS BehaviorSubject and ReplaySubject): `adapt(source)`
 * - does not give the current value (Zustand, Redux, XState): `adapt(source, source.getState)`
 * - has a different method altogether (Valtio, Jotai): `adapt({ subscribe }, current)`
 */

type Case = {
  name: string;
  /** A fresh source at 0, adapted, with a way to write to it and a count of the subscriptions to it that are alive. */
  make: () => { reactive: Reactive<number>; write: (n: number) => void; active: () => number };
};

/** Counts the subscriptions that are alive on `source`, by wrapping its own `subscribe`, whether it returns a function or a Subscription. */
function counting(source: object) {
  let active = 0;
  const original: (...args: unknown[]) => unknown = Reflect.get(source, 'subscribe');
  Reflect.set(source, 'subscribe', (...args: unknown[]) => {
    active++;
    const result = original.apply(source, args);
    let done = false;
    const once = () => {
      if (!done) {
        done = true;
        active--;
      }
    };
    if (typeof result === 'function') {
      return () => {
        once();
        result();
      };
    }
    const subscription = result as { unsubscribe(): void };
    return {
      unsubscribe: () => {
        once();
        subscription.unsubscribe();
      },
    };
  });
  return () => active;
}

const cases: Case[] = [
  {
    name: 'Zustand',
    make() {
      const store = createStore<{ count: number }>(() => ({ count: 0 }));
      const active = counting(store);
      return {
        reactive: select(
          adapt(store, () => store.getState()),
          'count',
        ),
        write: (n) => store.setState({ count: n }),
        active,
      };
    },
  },
  {
    name: 'Redux',
    make() {
      const store = createReduxStore((state: { count: number } = { count: 0 }, action: { type: string; value?: number }) =>
        action.type === 'set' ? { count: action.value ?? 0 } : state,
      );
      const active = counting(store);
      return {
        reactive: select(
          adapt(store, () => store.getState()),
          'count',
        ),
        write: (n) => {
          store.dispatch({ type: 'set', value: n });
        },
        active,
      };
    },
  },
  {
    name: 'XState',
    make() {
      const machine = createMachine({
        types: {} as { context: { count: number }; events: { type: 'set'; value: number } },
        context: { count: 0 },
        on: { set: { actions: assign({ count: ({ event }) => event.value }) } },
      });
      const actor = createActor(machine).start();
      const active = counting(actor);
      return {
        reactive: select(
          adapt(actor, () => actor.getSnapshot()),
          (s) => s.context.count,
        ),
        write: (n) => actor.send({ type: 'set', value: n }),
        active,
      };
    },
  },
  {
    name: 'RxJS BehaviorSubject',
    make() {
      const subject = new BehaviorSubject(0);
      const active = counting(subject);
      return { reactive: adapt(subject), write: (n) => subject.next(n), active };
    },
  },
  {
    name: 'RxJS ReplaySubject, piped',
    make() {
      const subject = new ReplaySubject<number>(1);
      subject.next(0);
      const piped = subject.pipe(map((n) => n * 10));
      const active = counting(piped);
      return { reactive: select(adapt(piped), (n) => n / 10), write: (n) => subject.next(n), active };
    },
  },
  {
    name: 'Svelte store',
    make() {
      const store = writable(0);
      const active = counting(store);
      return { reactive: adapt(store), write: (n) => store.set(n), active };
    },
  },
  {
    name: 'Nanostores',
    make() {
      const store = atom(0);
      const active = counting(store);
      return { reactive: adapt(store), write: (n) => store.set(n), active };
    },
  },
  {
    name: 'Preact Signals',
    make() {
      const count = signal(0);
      const active = counting(count);
      return {
        reactive: adapt(count),
        write: (n) => {
          count.value = n;
        },
        active,
      };
    },
  },
  {
    name: 'Valtio',
    make() {
      const state = proxy({ count: 0 });
      let alive = 0;
      const source = {
        // `true` makes it notify synchronously, like pipis does; by default it batches to a microtask.
        subscribe: (callback: () => void) => {
          alive++;
          const stop = valtioSubscribe(state, callback, true);
          return () => {
            alive--;
            stop();
          };
        },
      };
      return {
        reactive: select(
          adapt(source, () => snapshot(state)),
          'count',
        ),
        write: (n) => {
          state.count = n;
        },
        active: () => alive,
      };
    },
  },
  {
    name: 'Jotai',
    make() {
      const store = createJotaiStore();
      const count = jotaiAtom(0);
      let alive = 0;
      const source = {
        subscribe: (callback: () => void) => {
          alive++;
          const stop = store.sub(count, callback);
          return () => {
            alive--;
            stop();
          };
        },
      };
      return {
        reactive: adapt(source, () => store.get(count)),
        write: (n) => store.set(count, n),
        active: () => alive,
      };
    },
  },
];

describe.each(cases)('$name through adapt', ({ make }) => {
  it('shows the current value as soon as it is mounted', () => {
    const { reactive } = make();
    expect(mount(h('p', {}, reactive)).root.textContent).toBe('0');
  });

  it('shows the current value of a source that was changed before it was mounted', () => {
    const { reactive, write } = make();
    write(1);
    expect(mount(h('p', {}, reactive)).root.textContent).toBe('1');
  });

  it('follows changes', () => {
    const { reactive, write } = make();
    const { root } = mount(h('p', {}, reactive));
    write(2);
    expect(root.textContent).toBe('2');
    write(3);
    expect(root.textContent).toBe('3');
  });

  it('is not subscribed to before it is mounted, and leaves nothing subscribed after it is unmounted', () => {
    const { reactive, active } = make();
    const element = h('p', {}, reactive);
    expect(active()).toBe(0);
    const { unmount } = mount(element);
    expect(active()).toBe(1);
    unmount();
    expect(active()).toBe(0);
  });

  it('can be mounted again after unmounting, and shows the value it has by then', () => {
    const { reactive, write, active } = make();
    const element = h('p', {}, reactive);
    const { root, unmount } = mount(element);
    unmount();
    write(4);
    element(root);
    expect(root.textContent).toBe('4');
    expect(active()).toBe(1);
    unmount();
    expect(active()).toBe(0);
  });
});

describe('adapt', () => {
  it('leaves the object it is given alone, and returns a new Reactive', () => {
    const store = createStore<{ count: number }>(() => ({ count: 0 }));
    const adapted = adapt(store, () => store.getState());
    expect(isReactive(adapted)).toBe(true);
    expect(isReactive(store)).toBe(false);
    expect(adapted).not.toBe(store);
  });

  it('shows nothing for an Observable that has no value yet, until it emits', () => {
    const subject = new Subject<number>();
    const { root } = mount(h('p', {}, adapt(subject)));
    expect(root.textContent).toBe('');
    subject.next(5);
    expect(root.textContent).toBe('5');
  });

  it('accepts a source that returns a cleanup function, and one that returns a Subscription, with the same result', () => {
    const calls: string[] = [];
    const withFunction = adapt({ subscribe: () => () => calls.push('function') });
    const withSubscription = adapt({ subscribe: () => ({ unsubscribe: () => calls.push('subscription') }) });
    withFunction.subscribe(() => {})();
    withSubscription.subscribe(() => {})();
    expect(calls).toEqual(['function', 'subscription']);
  });

  it('calls the current-value function for the first value and again on every notification, ignoring what the source passes', () => {
    let notify = (..._args: unknown[]) => {};
    let current = 1;
    const seen: number[] = [];
    adapt(
      {
        subscribe: (callback: (...args: unknown[]) => void) => {
          notify = callback;
          return () => {};
        },
      },
      () => current,
    ).subscribe((v) => seen.push(v));
    current = 2;
    notify('ignored', 'arguments');
    expect(seen).toEqual([1, 2]);
  });
});
