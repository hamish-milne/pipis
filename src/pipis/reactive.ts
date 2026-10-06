import { type Reactive, REACTIVE } from "./core";

/**
 * Adapts an object with a `subscribe` method to be recognized as a reactive object by setting the `[REACTIVE]` property.
 */
export function adapt<T extends { subscribe: (callback: (newValue: any) => void) => () => void }>(
  obj: T,
): T & { [REACTIVE]: true } {
  return Object.assign(obj, { [REACTIVE]: true as const });
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
      for (const callback of this._s) {
        callback(newValue);
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

function isMergeable(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep<T>(target: T, source: DeepPartial<T>): T {
  if (isMergeable(source) && isMergeable(target)) {
    const result: T = { ...target };
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        result[key as keyof T] = mergeDeep(
          target[key as keyof T],
          source[key as keyof typeof source] as DeepPartial<T[keyof T]>,
        );
      }
    }
    return result;
  }
  return source as T;
}

export function patch<T>(state: ReactiveState<T>, partial: DeepPartial<T>): void {
  state.value = mergeDeep(state.value, partial);
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
    const SelectBinding_subscribe = (newValue: TIn) => {
      const newOut = this._c(newValue);
      if (newOut !== prevValue) {
        prevValue = newOut;
        callback(prevValue);
      }
    };
    return this._i.subscribe(SelectBinding_subscribe);
  }
}

/** Derives a read-only reactive value from `input` by applying `compute`, only notifying subscribers when the result actually changes. */
export function select<TIn, TOut>(
  input: Reactive<TIn>,
  compute: (input: TIn) => TOut,
): Reactive<TOut>;
/** Derives a read-only reactive value by selecting a single property key out of `input`. */
export function select<TIn, TKey extends keyof TIn>(
  input: Reactive<TIn>,
  key: TKey,
): Reactive<TIn[TKey]>;

export function select<TIn, TOut>(
  input: Reactive<TIn>,
  compute: ((input: TIn) => TOut) | keyof TIn,
): Reactive<TOut> {
  return new ReactiveSelect(
    input,
    typeof compute === "function" ? compute : (input: TIn) => input[compute] as TOut,
  );
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
  const stack = [defaultValue];
  function context_provider<U>(value: T, inner: () => U): U {
    stack.push(value);
    try {
      return inner();
    } finally {
      stack.pop();
    }
  }
  const context_consumer = () => stack[stack.length - 1];
  return [context_provider, context_consumer] as const;
}
export type ErrorHandler = (error: unknown) => void;

export const [withErrorHandler, getErrorHandler] = defineContext<ErrorHandler>(console.error);
type AnyFunction = (...args: any[]) => any;
type AddReturnType<F extends AnyFunction, R> = (...args: Parameters<F>) => ReturnType<F> | R;

export function handleError<T extends AnyFunction>(
  fn: T,
  err?: undefined,
): AddReturnType<T, undefined>;
export function handleError<T extends AnyFunction, TErr>(fn: T, err: TErr): AddReturnType<T, TErr>;

export function handleError<T extends AnyFunction, TErr>(fn: T, err: TErr): AddReturnType<T, TErr> {
  return function handleError_wrapper(...args) {
    try {
      return fn(...args);
    } catch (error) {
      getErrorHandler()(error);
      return err;
    }
  };
}

export function subscribeWithCatch<T>(
  reactive: Reactive<T>,
  callback: (newValue: T) => void,
): () => void {
  return reactive.subscribe(handleError(callback));
}
