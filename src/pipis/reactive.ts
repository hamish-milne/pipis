import { type Cleanup, type Reactive, REACTIVE } from './core.ts';

/** What `subscribe` returns in the libraries `adapt` is for: a cleanup function (Zustand, Redux, Svelte), or a Subscription (RxJS, XState). */
type Unsubscribable = Cleanup | { unsubscribe(): void };

/**
 * Makes a {@link Reactive} out of a store, signal or Observable from another library, without touching it.
 *
 * A Reactive gives its subscriber the current value as soon as it is subscribed to, and returns a function that unsubscribes. Where the
 * library's own `subscribe` already does that (RxJS `BehaviorSubject`, Svelte and Nanostores stores, Preact signals), pass it alone: a
 * returned Subscription object is turned into a cleanup function. Where it does not give the current value (Zustand, Redux, XState),
 * also pass a function that reads it, such as `store.getState`: it is called to give the first value, and again on every notification,
 * so the arguments the library passes to its listener do not matter.
 */
export function adapt<T>(source: { subscribe(callback: (value: T) => void): Unsubscribable }): Reactive<T>;
export function adapt<T>(source: { subscribe(callback: () => void): Unsubscribable }, current: () => T): Reactive<T>;

export function adapt<T>(
  source: { subscribe(callback: (value: T) => void): Unsubscribable } | { subscribe(callback: () => void): Unsubscribable },
  current?: () => T,
): Reactive<T> {
  return {
    [REACTIVE]: true,
    subscribe(callback) {
      if (current) callback(current());
      const listener = current ? () => callback(current()) : callback;
      // The overloads guarantee that the listener is the kind this source takes (one that reads `current` for one that has a getter,
      // the callback itself for one that gives the value), but TypeScript cannot follow that through a union of the two source types.
      // oxlint-disable-next-line typescript/consistent-type-assertions -- see the comment above: the overloads make this safe
      const subscription = (source as { subscribe(callback: typeof listener): Unsubscribable }).subscribe(listener);
      return typeof subscription === 'function' ? subscription : () => subscription.unsubscribe();
    },
  };
}

/** A {@link Reactive} value with synchronous, always-up-to-date read access via `.value`. */
export type ReactiveReadonly<T> = Reactive<T> & {
  get value(): T;
};

/** A {@link ReactiveReadonly} value that can also be written to via `.value`, notifying subscribers. */
export type ReactiveState<T> = ReactiveReadonly<T> & {
  set value(newValue: T);
};

class ReactiveStateImpl<T> implements ReactiveState<T> {
  declare [REACTIVE]: true;
  declare private _s: Set<(newValue: T) => void>;
  declare private _v: T;

  constructor(initialValue: T) {
    this[REACTIVE] = true;
    this._s = new Set();
    this._v = initialValue;
  }

  get value(): T {
    return this._v;
  }

  set value(newValue: T) {
    if (this._v !== newValue) {
      this._v = newValue;
      // A snapshot, so a subscriber added by a callback is not also called by this loop (it already had its immediate call). One that
      // an earlier callback removed is skipped, as it would be if it were removed before the write.
      // oxlint-disable-next-line unicorn/no-useless-spread -- the copy is the point: the set changes while this loop runs
      for (const callback of [...this._s]) {
        if (this._s.has(callback)) callback(newValue);
      }
    }
  }

  subscribe(callback: (newValue: T) => void) {
    this._s.add(callback);
    callback(this.value);
    const binding_cleanup = () => {
      this._s.delete(callback);
    };
    return binding_cleanup;
  }
}

/** Creates a simple, independently-writable {@link ReactiveState} value. */
export function reactive<T>(initialValue: T): ReactiveState<T>;
export function reactive<T>(initialValue?: T): ReactiveState<T | undefined>;

export function reactive<T>(initialValue: T): ReactiveState<T> {
  return new ReactiveStateImpl(initialValue);
}

export type DeepPartial<T> = T extends object
  ? T extends (infer _)[]
    ? T
    : {
        [P in keyof T]?: DeepPartial<T[P]>;
      }
  : T;

/** Only a plain object (one made by `{}` or `Object.create(null)`) is merged key by key; an array, a Date, a Map or a class instance is a value. */
function isMergeable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergeDeep(target: unknown, source: unknown): unknown {
  if (isMergeable(source) && isMergeable(target)) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      result[key] = mergeDeep(target[key], source[key]);
    }
    return result;
  }
  return source;
}

export function patch<T>(state: ReactiveState<T>, partial: DeepPartial<T>): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the merge only replaces keys that `partial` names, with values of the type those keys have in `T`, so the result is a `T`
  state.value = mergeDeep(state.value, partial) as T;
}

const UNDEFINED = Symbol();

class ReactiveSelect<TIn, TOut> implements Reactive<TOut> {
  declare [REACTIVE]: true;
  declare private _i: Reactive<TIn>;
  declare private _c: (input: TIn) => TOut;

  constructor(input: Reactive<TIn>, compute: (input: TIn) => TOut) {
    this[REACTIVE] = true;
    this._i = input;
    this._c = compute;
  }

  subscribe(callback: (newValue: TOut) => void) {
    let prevValue: TOut | typeof UNDEFINED = UNDEFINED;
    // A compute function that throws is reported, and the select simply keeps its last value, so the error cannot reach whoever wrote
    // to the input.
    const compute = handleError(this._c, UNDEFINED);
    const SelectBinding_subscribe = (newValue: TIn) => {
      const newOut = compute(newValue);
      if (newOut !== UNDEFINED && newOut !== prevValue) {
        prevValue = newOut;
        callback(prevValue);
      }
    };
    return this._i.subscribe(SelectBinding_subscribe);
  }
}

/** Derives a read-only reactive value from `input` by applying `compute`, only notifying subscribers when the result actually changes. */
export function select<TIn, TOut>(input: Reactive<TIn>, compute: (input: TIn) => TOut): Reactive<TOut>;
/** Derives a read-only reactive value by selecting a single property key out of `input`. */
export function select<TIn, TKey extends keyof TIn>(input: Reactive<TIn>, key: TKey): Reactive<TIn[TKey]>;

export function select<TIn>(input: Reactive<TIn>, compute: ((input: TIn) => unknown) | keyof TIn): Reactive<unknown> {
  return new ReactiveSelect(input, typeof compute === 'function' ? compute : (value: TIn) => value[compute]);
}

class ReactiveConstant<T> implements Reactive<T> {
  declare [REACTIVE]: true;
  declare private _v: T;

  constructor(value: T) {
    this[REACTIVE] = true;
    this._v = value;
  }

  get value(): T {
    return this._v;
  }

  subscribe(callback: (newValue: T) => void) {
    callback(this._v);
    return () => {};
  }
}

/** Wraps a static value as a {@link ReactiveReadonly}, for APIs that require a reactive input. */
export const constant = <T>(value: T): ReactiveReadonly<T> => new ReactiveConstant(value); /**
 * Creates a context: a `[provider, consumer]` pair for passing a value down the component tree
 * without threading it through every level of props. The consumer resolves to the nearest
 * enclosing provider's value at the time the component is constructed.
 */

export function defineContext<T>(defaultValue: T) {
  let current = defaultValue;
  function context_provider<U>(value: T, inner: () => U): U {
    const outer = current;
    current = value;
    try {
      return inner();
    } finally {
      current = outer;
    }
  }
  const context_consumer = () => current;
  return [context_provider, context_consumer] as const;
}
export type ErrorHandler = (error: unknown) => void;

export const [withErrorHandler, getErrorHandler] = defineContext<ErrorHandler>(console.error);

export function handleError<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  err?: undefined,
): (...args: TArgs) => TResult | undefined;
export function handleError<TArgs extends unknown[], TResult, TErr>(
  fn: (...args: TArgs) => TResult,
  err: TErr,
): (...args: TArgs) => TResult | TErr;

export function handleError<TArgs extends unknown[], TResult, TErr>(
  fn: (...args: TArgs) => TResult,
  err: TErr,
): (...args: TArgs) => TResult | TErr {
  // The handler is the one current when the wrapper is made, not when it throws: a subscriber runs long after the code that made it
  // (a state change, say), by which time the ErrorBoundary it was mounted under is no longer the one being provided.
  const handler = getErrorHandler();
  return function handleError_wrapper(...args) {
    try {
      return fn(...args);
    } catch (error) {
      handler(error);
      return err;
    }
  };
}

export function subscribeWithCatch<T>(reactive: Reactive<T>, callback: (newValue: T) => void): () => void {
  return reactive.subscribe(handleError(callback));
}
