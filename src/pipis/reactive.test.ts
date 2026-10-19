import { describe, expect, it, vi } from 'vite-plus/test';
import { REACTIVE, isReactive, subscribe } from './core.ts';
import { constant, defineContext, handleError, patch, reactive, select, subscribeWithCatch, withErrorHandler } from './reactive.ts';
import { quiet, tracked } from '../test/dom.ts';

/** Subscribes and records every value the callback is given. */
function record<T>(source: { subscribe(callback: (value: T) => void): () => void }) {
  const seen: T[] = [];
  const off = source.subscribe((value) => seen.push(value));
  return { seen, off };
}

describe('reactive', () => {
  it('calls a new subscriber at once with the current value', () => {
    const x = reactive(1);
    expect(record(x).seen).toEqual([1]);
  });

  it('reads back what was written', () => {
    const x = reactive('a');
    x.value = 'b';
    expect(x.value).toBe('b');
  });

  it('notifies subscribers synchronously, in the order they subscribed', () => {
    const x = reactive(0);
    const order: string[] = [];
    x.subscribe((v) => v && order.push(`first ${v}`));
    x.subscribe((v) => v && order.push(`second ${v}`));
    x.value = 1;
    // Synchronous: both have run by the time the assignment returns.
    expect(order).toEqual(['first 1', 'second 1']);
  });

  it('does not notify when the new value is identical', () => {
    const x = reactive(1);
    const { seen } = record(x);
    x.value = 1;
    expect(seen).toEqual([1]);
  });

  it('compares by identity, so an equal but new object notifies', () => {
    const x = reactive({ n: 1 });
    const { seen } = record(x);
    x.value = { n: 1 };
    expect(seen).toHaveLength(2);
  });

  it('notifies on every assignment of NaN, because NaN !== NaN', () => {
    const x = reactive(Number.NaN);
    const { seen } = record(x);
    x.value = Number.NaN;
    x.value = Number.NaN;
    expect(seen).toHaveLength(3);
  });

  it('stops notifying after unsubscribe, and unsubscribing twice is harmless', () => {
    const x = reactive(0);
    const a = record(x);
    const b = record(x);
    a.off();
    a.off();
    x.value = 1;
    expect(a.seen).toEqual([0]);
    expect(b.seen).toEqual([0, 1]);
  });

  it('registers one function subscribed twice only once, so one unsubscribe removes both', () => {
    const x = reactive(0);
    const calls: number[] = [];
    const callback = (v: number) => calls.push(v);
    const off = x.subscribe(callback);
    x.subscribe(callback);
    x.value = 1;
    // Both subscribes were answered at once (two zeros) but a change is delivered once.
    expect(calls).toEqual([0, 0, 1]);
    off();
    x.value = 2;
    expect(calls).toEqual([0, 0, 1]);
  });

  it('skips a subscriber that was unsubscribed by an earlier one during the same notification', () => {
    const x = reactive(0);
    let offSecond = () => {};
    const second: number[] = [];
    x.subscribe((v) => v === 1 && offSecond());
    offSecond = x.subscribe((v) => second.push(v));
    x.value = 1;
    expect(second).toEqual([0]);
  });

  // ADR 6: subscribers are notified from a snapshot, so one that is added during a notification has had its call when it subscribed
  // and is not called again by the loop that is still running.
  it('calls a subscriber that was added during a notification once, not twice', () => {
    const x = reactive(false);
    let calls = 0;
    x.subscribe((v) => {
      if (v) x.subscribe(() => calls++);
    });
    calls = 0;
    x.value = true;
    expect(calls).toBe(1);
  });

  // Notification is synchronous and unbatched, so a write made from inside a subscriber is delivered at once, ahead of the
  // notification that is still running. A subscriber after the writer therefore sees the newer value first and the older one last,
  // and is left holding a stale value. Writing from a subscriber is an antipattern (LLM.md, mistake 10), so this is the expected
  // behaviour rather than something to fix; this test pins it down so it is not changed by accident.
  it('delivers a write made from a subscriber at once, so a later subscriber sees the values out of order', () => {
    const x = reactive(0);
    x.subscribe((v) => {
      if (v === 1) x.value = 2;
    });
    const { seen } = record(x);
    x.value = 1;
    expect(seen).toEqual([0, 2, 1]);
    expect(x.value).toBe(2);
  });
});

describe('select', () => {
  it('gives the computed value at once, then on each change', () => {
    const x = reactive(2);
    const { seen } = record(select(x, (v) => v * 10));
    x.value = 3;
    expect(seen).toEqual([20, 30]);
  });

  it('selects a property by key', () => {
    const x = reactive({ name: 'a', age: 1 });
    const { seen } = record(select(x, 'name'));
    x.value = { name: 'b', age: 1 };
    expect(seen).toEqual(['a', 'b']);
  });

  it('does not notify when the result is unchanged, so an unrelated field costs nothing downstream', () => {
    const x = reactive({ name: 'a', age: 1 });
    const { seen } = record(select(x, 'name'));
    x.value = { name: 'a', age: 2 };
    expect(seen).toEqual(['a']);
  });

  it('is a Reactive', () => {
    expect(isReactive(select(reactive(1), (v) => v))).toBe(true);
  });

  it('subscribes to its input only while it is subscribed to', () => {
    const x = tracked(1);
    const derived = select(x.reactive, (v) => v + 1);
    expect(x.active).toBe(0);
    const { off } = record(derived);
    expect(x.active).toBe(1);
    off();
    expect(x.active).toBe(0);
  });

  it('computes once per subscriber and per change, because it caches nothing between subscribers', () => {
    const x = reactive(1);
    const compute = vi.fn((v: number) => v * 2);
    const derived = select(x, compute);
    record(derived);
    record(derived);
    compute.mockClear();
    x.value = 2;
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps each subscriber’s own last value, so one joining late still gets the current one', () => {
    const x = reactive(1);
    const derived = select(x, (v) => v * 2);
    const early = record(derived);
    x.value = 2;
    const late = record(derived);
    expect(early.seen).toEqual([2, 4]);
    expect(late.seen).toEqual([4]);
  });

  it('chains: a select of a select updates once per change and in dependency order', () => {
    const x = reactive(1);
    const double = select(x, (v) => v * 2);
    const plusOne = select(double, (v) => v + 1);
    const { seen } = record(plusOne);
    x.value = 2;
    x.value = 3;
    expect(seen).toEqual([3, 5, 7]);
  });

  // LLM.md mistake 8: it recomputes when its input changes, not when something it reads through a closure changes.
  it('goes stale when it reads other state through a closure', () => {
    const sel = reactive({ category: 'a', sortKey: 'name' });
    const category = select(sel, 'category');
    const top = select(category, (c) => `${c}:${sel.value.sortKey}`);
    const { seen } = record(top);
    sel.value = { category: 'a', sortKey: 'price' };
    expect(seen).toEqual(['a:name']);
    sel.value = { category: 'b', sortKey: 'price' };
    expect(seen).toEqual(['a:name', 'b:price']);
  });

  // The reason there is no multi-input select: two derived values from one source are notified one after the other, so code
  // that reads both can see one new and one old.
  it('lets a reader of two derived values see a mixed state between their notifications', () => {
    const x = reactive(1);
    const a = select(x, (v) => v);
    const b = select(x, (v) => v * 10);
    let latestA = 0;
    let latestB = 0;
    const states: string[] = [];
    a.subscribe((v) => {
      latestA = v;
      states.push(`${latestA},${latestB}`);
    });
    b.subscribe((v) => {
      latestB = v;
      states.push(`${latestA},${latestB}`);
    });
    states.length = 0;
    x.value = 2;
    expect(states).toEqual(['2,10', '2,20']);
  });
});

describe('select compute errors', () => {
  it('reports a compute function that throws, and keeps the last value instead of notifying', () => {
    const errors: unknown[] = [];
    const x = reactive(1);
    const { seen } = withErrorHandler(
      (e) => errors.push(e),
      () =>
        record(
          select(x, (v) => {
            if (v === 2) throw new Error('bad input');
            return v * 10;
          }),
        ),
    );
    x.value = 2;
    x.value = 3;
    expect(seen).toEqual([10, 30]);
    expect(errors).toHaveLength(1);
  });

  it('does not let the error reach whoever wrote to the input', () => {
    const x = reactive(1);
    quiet(() =>
      record(
        select(x, (v) => {
          if (v === 2) throw new Error('bad input');
          return v;
        }),
      ),
    );
    expect(() =>
      quiet(() => {
        x.value = 2;
      }),
    ).not.toThrow();
  });

  it('reports a compute function that throws on the first value, and notifies once it recovers', () => {
    const errors: unknown[] = [];
    const x = reactive(0);
    const { seen } = withErrorHandler(
      (e) => errors.push(e),
      () =>
        record(
          select(x, (v) => {
            if (v === 0) throw new Error('not yet');
            return v;
          }),
        ),
    );
    x.value = 5;
    expect(errors).toHaveLength(1);
    expect(seen).toEqual([5]);
  });
});

describe('constant', () => {
  it('gives its value once and never again', () => {
    const c = constant(5);
    const { seen, off } = record(c);
    off();
    expect(seen).toEqual([5]);
    expect(c.value).toBe(5);
    expect(isReactive(c)).toBe(true);
  });
});

describe('subscribe', () => {
  it('is reactive.subscribe as a function, for bundle size', () => {
    const x = reactive(1);
    const seen: number[] = [];
    const off = subscribe(x, (v) => seen.push(v));
    x.value = 2;
    off();
    x.value = 3;
    expect(seen).toEqual([1, 2]);
  });
});

describe('isReactive', () => {
  it('recognises the brand and nothing else', () => {
    expect(isReactive(reactive(1))).toBe(true);
    expect(isReactive(constant(1))).toBe(true);
    for (const value of [null, undefined, 0, '', 'a', {}, [], () => {}, { subscribe() {} }, { [REACTIVE]: false }]) {
      expect(isReactive(value)).toBe(false);
    }
  });
});

describe('patch', () => {
  it('merges nested objects key by key and keeps the rest', () => {
    const state = reactive({ a: 1, nested: { x: 1, y: 2 }, keep: 'k' });
    patch(state, { nested: { y: 3 } });
    expect(state.value).toEqual({ a: 1, nested: { x: 1, y: 3 }, keep: 'k' });
  });

  it('assigns a new object, leaving the old one untouched', () => {
    const before = { a: 1, nested: { x: 1 } };
    const state = reactive(before);
    patch(state, { nested: { x: 2 } });
    expect(state.value).not.toBe(before);
    expect(before).toEqual({ a: 1, nested: { x: 1 } });
  });

  it('replaces arrays outright instead of merging them', () => {
    const state = reactive({ list: [1, 2, 3] });
    patch(state, { list: [9] });
    expect(state.value.list).toEqual([9]);
  });

  it('replaces an object with null, and a primitive with an object', () => {
    const state = reactive<{ a: { x: number } | null; b: number | { y: number } }>({ a: { x: 1 }, b: 1 });
    patch(state, { a: null, b: { y: 2 } });
    expect(state.value).toEqual({ a: null, b: { y: 2 } });
  });

  it('sets a key to undefined when the patch names it with undefined', () => {
    const state = reactive<{ a?: number; b: number }>({ a: 1, b: 2 });
    patch(state, { a: undefined });
    expect(state.value).toEqual({ a: undefined, b: 2 });
  });

  it('notifies even when nothing changes, because the result is always a new object', () => {
    const state = reactive({ a: 1 });
    const { seen } = record(state);
    patch(state, { a: 1 });
    expect(seen).toHaveLength(2);
  });

  it('does not reach Object.prototype through a __proto__ key', () => {
    const state = reactive<Record<string, unknown>>({});
    patch(state, JSON.parse('{"__proto__": {"polluted": true}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  // A Date (or a Map, or a class instance) is an object with no enumerable keys, so merging it key by key yields `{}`.
  it('keeps a Date a Date when it is patched', () => {
    const state = reactive({ when: new Date(0) });
    patch(state, { when: new Date(5) });
    expect(state.value.when).toBeInstanceOf(Date);
    expect(state.value.when.getTime()).toBe(5);
  });
});

describe('defineContext', () => {
  it('gives the default outside any provider', () => {
    const [, consumer] = defineContext('default');
    expect(consumer()).toBe('default');
  });

  it('gives the nearest provider’s value inside, and restores the outer one after', () => {
    const [provider, consumer] = defineContext('default');
    const seen: string[] = [];
    provider('outer', () => {
      seen.push(consumer());
      provider('inner', () => seen.push(consumer()));
      seen.push(consumer());
    });
    seen.push(consumer());
    expect(seen).toEqual(['outer', 'inner', 'outer', 'default']);
  });

  it('returns what the inner function returns', () => {
    const [provider] = defineContext(0);
    expect(provider(1, () => 'result')).toBe('result');
  });

  it('restores the outer value when the inner function throws', () => {
    const [provider, consumer] = defineContext('default');
    expect(() =>
      provider('inner', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(consumer()).toBe('default');
  });

  it('is resolved when the code runs, so a read after an await sees the default again', async () => {
    const [provider, consumer] = defineContext('default');
    let afterAwait = '';
    await provider('provided', async () => {
      await Promise.resolve();
      afterAwait = consumer();
    });
    // The provider returned as soon as the function reached its first await, and restored the outer value.
    expect(afterAwait).toBe('default');
  });
});

describe('error handling', () => {
  it('handleError passes through a result and the arguments', () => {
    const add = handleError((a: number, b: number) => a + b);
    expect(add(1, 2)).toBe(3);
  });

  it('handleError reports a throw to the handler and returns the fallback', () => {
    const seen: unknown[] = [];
    const boom = new Error('boom');
    const result = withErrorHandler(
      (e) => seen.push(e),
      () =>
        handleError(() => {
          throw boom;
        }, 'fallback')(),
    );
    expect(seen).toEqual([boom]);
    expect(result).toBe('fallback');
  });

  it('handleError returns undefined by default when the function throws', () => {
    const wrapped = quiet(() =>
      handleError((): number => {
        throw new Error('x');
      }),
    );
    expect(quiet(() => wrapped())).toBeUndefined();
  });

  // ADR 12: an error thrown later, from a subscriber that runs on a change, reaches the handler of the ErrorBoundary the code was
  // mounted under. So the handler is the one current when the wrapper is made, whatever is current when it throws.
  it('reports a later error to the handler that was current when the wrapper was made', () => {
    const seen: unknown[] = [];
    const x = reactive(0);
    withErrorHandler(
      (e) => seen.push(e),
      () => {
        subscribeWithCatch(x, (v) => {
          if (v === 1) throw new Error('later');
        });
      },
    );
    quiet(() => {
      x.value = 1;
    });
    expect(seen).toHaveLength(1);
  });

  it('keeps the handler of each wrapper separate when they are made in different scopes', () => {
    const outer: unknown[] = [];
    const inner: unknown[] = [];
    const x = reactive(0);
    const y = reactive(0);
    const boom = (v: number) => {
      if (v === 1) throw new Error('boom');
    };
    withErrorHandler(
      (e) => outer.push(e),
      () => {
        subscribeWithCatch(x, boom);
        withErrorHandler(
          (e) => inner.push(e),
          () => subscribeWithCatch(y, boom),
        );
      },
    );
    x.value = 1;
    y.value = 1;
    expect([outer.length, inner.length]).toEqual([1, 1]);
  });

  it('subscribeWithCatch keeps a throwing subscriber from stopping the others', () => {
    const errors: unknown[] = [];
    withErrorHandler(
      (e) => errors.push(e),
      () => {
        const x = reactive(0);
        subscribeWithCatch(x, () => {
          throw new Error('first');
        });
        const { seen } = record(x);
        x.value = 1;
        expect(seen).toEqual([0, 1]);
      },
    );
    // One error for the immediate call when it subscribed, one for the change.
    expect(errors).toHaveLength(2);
  });
});
