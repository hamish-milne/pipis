import {
  type Cleanup,
  type JSXElement,
  type Reactive,
  Fragment,
  type RefProp,
  setRef,
  isReactive,
  createMarker,
  moveNode,
  type JSXParent,
  type JSXSibling,
  type ChildrenProp,
} from './core.ts';
import { getErrorHandler, handleError, reactive, select, subscribeWithCatch, withErrorHandler, type ReactiveReadonly } from './reactive.ts';

type MountFn = (parent: Exclude<JSXParent, undefined>, sibling: JSXSibling) => Cleanup | void;
/**
 * Builds a {@link JSXElement} whose content can change shape over time (be added, removed, or
 * reordered) without breaking the fixed "head" contract that {@link JSXElement} requires.
 *
 * A persistent {@link createMarker marker} node is inserted once, immediately before the original
 * `sibling`, before `mount` ever runs - so it's always the leftmost node of the region, and is
 * always returned as this element's head, however its content changes later. `mount` is free to
 * insert/move/remove real content anywhere between the marker and `sibling`.
 *
 * `mount` is only called once per mount (guarded with `cleanup ??=`), so subscribing inside it is
 * safe even if the returned element's mount function is invoked again with the same parent.
 */
export function dynamic(mount: MountFn, unmount: Cleanup): JSXElement {
  const marker = createMarker();
  let cleanup: Cleanup | void;
  let nextSibling: JSXSibling = null;
  return function Dynamic_element(parent, sibling = null) {
    // Manually track the sibling here because the mount function adds additional nodes,
    // so the marker's DOM sibling isn't the same as the element's sibling.
    // The sibling is only given to moveNode when it has changed: once content is mounted the marker's own next node is that content,
    // not the sibling, so comparing against it would move the marker, and remount everything, on every call.
    if (moveNode(marker, parent, sibling !== nextSibling ? sibling : undefined) || sibling !== nextSibling) {
      cleanup?.();
      if (parent) {
        cleanup = mount(parent, sibling);
      } else {
        cleanup = undefined;
        unmount();
      }
      nextSibling = sibling;
    }
    return parent ? marker : sibling;
  };
}

/** One keyed row: its element, and what to do when the item for its key arrives again in a later update. */
type Row<T> = { element: JSXElement; update?: (item: T) => void };

/**
 * What {@link List} and {@link ReactiveList} share: rows keyed by `itemKey`, so items can be added, removed, and reordered without
 * recreating unaffected rows. Each row is (re-)mounted on every update by iterating back-to-front and chaining each row's returned
 * head node as the next row's `sibling`; combined with {@link moveNode}, a row only costs a real DOM operation when it actually moved.
 * `createRow` makes the row for a key the first time it is seen, and `update` is told about the item whenever the key is seen again.
 */
function keyedRows<T>(
  items: Reactive<readonly T[]>,
  itemKey: (item: T, index: number) => PropertyKey,
  createRow: (item: T, index: number) => Row<T>,
): JSXElement {
  const rows = new Map<PropertyKey, Row<T>>();
  const mountRows: MountFn = (parent, sibling) =>
    subscribeWithCatch(items, function List_items(newItems) {
      const entries = newItems.map((item, index) => ({ item, index, key: itemKey(item, index) }));
      // A Set, not an array: looking each rendered key up in an array makes every update cost rows x rows.
      const keys = new Set(entries.map((entry) => entry.key));
      for (const [key, row] of rows) {
        if (!keys.has(key)) {
          row.element();
          rows.delete(key);
        }
      }
      let head = sibling;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!entry) continue;
        let row = rows.get(entry.key);
        if (row) {
          row.update?.(entry.item);
        } else {
          row = createRow(entry.item, entry.index);
          rows.set(entry.key, row);
        }
        head = row.element(parent, head);
      }
    });
  return dynamic(mountRows, function List_unmount() {
    for (const row of rows.values()) {
      row.element();
    }
    rows.clear();
  });
}

/**
 * Renders items from an array, one row per item, keyed by `itemKey`. A row is made once per key, from the plain item as it was then,
 * and reused: a later update that has the same key does not change it. So it suits items that do not change while their key stays the
 * same (add, remove and reorder are what it is for). When a row shows data that does, use {@link ReactiveList}.
 */
export function List<T>({
  items,
  itemKey,
  children,
}: {
  items: Reactive<readonly T[]>;
  itemKey: (item: T, index: number) => PropertyKey;
  children: (item: T, index: number) => JSXElement;
}): JSXElement {
  return keyedRows(items, itemKey, (item, index) => ({ element: children(item, index) }));
}

/**
 * Like {@link List}, but each row is given its item as a reactive value, which is updated whenever the item for that key changes (by
 * `!==`). A row selects from it (`select(item, 'name')`) and only the bindings that depend on what changed run. So the list can be
 * the array of items itself, with no ids and no search: one change costs one pass over the array, however many rows there are.
 * The `index` a row is given is its index when it was made, and does not follow later reordering.
 */
export function ReactiveList<T>({
  items,
  itemKey,
  children,
}: {
  items: Reactive<readonly T[]>;
  itemKey: (item: T, index: number) => PropertyKey;
  children: (item: ReactiveReadonly<T>, index: number) => JSXElement;
}): JSXElement {
  return keyedRows(items, itemKey, (item, index) => {
    const value = reactive(item);
    return {
      element: children(value, index),
      update: (next) => {
        value.value = next;
      },
    };
  });
}

/** Mounts one of several elements, chosen by `selector`, unmounting the previous choice on change. */
export function OneOf<T extends PropertyKey>({
  selector,
  children,
}: {
  selector: Reactive<T>;
  children: Partial<Record<T, JSXElement>>;
}): JSXElement {
  let current: JSXElement | undefined;
  const OneOf_mount: MountFn = (parent, sibling) =>
    subscribeWithCatch(selector, function OneOf_value(newValue) {
      current?.();
      current = children[newValue];
      if (current && parent) {
        current(parent, sibling);
      }
    });
  return dynamic(OneOf_mount, function OneOf_unmount() {
    current?.();
    current = undefined;
  });
}

/** Conditionally renders its child based on a boolean reactive value. */
export function If({
  condition,
  ...props
}: {
  condition: Reactive<boolean>;
} & ChildrenProp) {
  const children = Fragment(props);
  const If_mount: MountFn = (parent, sibling) =>
    subscribeWithCatch(condition, function If_value(newValue) {
      if (newValue) {
        children(parent, sibling);
      } else {
        children();
      }
    });
  return dynamic(If_mount, function If_unmount() {
    children();
  });
}

/**
 * Renders content computed from a reactive value, fully recreating the DOM whenever it changes.
 * Prefer {@link OneOf}, {@link List}, or {@link Repeat} where they fit; those update in place
 * instead of throwing away and rebuilding the DOM on every change.
 */
export function Dynamic<T>({ value, children }: { value: Reactive<T>; children: (props: T) => JSXElement }): JSXElement {
  let current: JSXElement | undefined;
  const Dynamic_mount: MountFn = (parent, sibling) =>
    subscribeWithCatch(value, function Dynamic_value(newValue) {
      current?.();
      current = children(newValue);
      if (current && parent) {
        current(parent, sibling);
      }
    });
  return dynamic(Dynamic_mount, function Dynamic_unmount() {
    current?.();
    current = undefined;
  });
}

// What an effect that returns no cleanup is given, so that "has run" and "has a cleanup" are the same thing for the guard below.
const EMPTY_CLEANUP: Cleanup = () => {};

/** Renders nothing, but runs `fn` on mount and its returned cleanup (if any) on unmount. */
export function effect(fn: () => Cleanup | undefined): JSXElement {
  let cleanup: Cleanup | undefined;
  return function Effect_element(parent, sibling = null) {
    if (parent) {
      // Wrapped here, at mount, so that it reports to the ErrorBoundary it is mounted under (it was built before that existed).
      cleanup ??= handleError(fn)() ?? EMPTY_CLEANUP;
    } else {
      cleanup?.();
      cleanup = undefined;
    }
    return sibling;
  };
}

/** JSX-friendly wrapper around {@link effect}, for running a side effect on mount/unmount. */
export const Effect = (props: { children: () => Cleanup | undefined }): JSXElement => effect(props.children);

/** Runs `children` with the current value on mount, and again on every subsequent change. */
export function Watch<T>({ value, children }: { value: Reactive<T>; children: (newValue: T) => void }): JSXElement {
  const Watch_effect = () =>
    subscribeWithCatch(value, function Watch_value(newValue) {
      children(newValue);
    });
  return effect(Watch_effect);
}

/**
 * Renders `loading` while `promise` is pending, `children(data)` once it
 * resolves, and `error(error)` if it rejects.
 */
export function Suspense<T>({
  promise,
  emptyData,
  loading,
  error,
  children,
}: {
  promise: (() => Promise<T>) | Reactive<Promise<T>>;
  emptyData: T;
  loading?: JSXElement;
  error?: (err: ReactiveReadonly<unknown>) => JSXElement;
  children: (value: ReactiveReadonly<T>) => JSXElement;
}): JSXElement {
  const state = reactive<0 | 1 | 2>(0);
  const successValue = reactive<T>(emptyData);
  const errorValue = reactive<unknown>();
  const successElement = children(successValue);

  // A promise that has been replaced is stale: whichever way it settles, and whenever, it must not overwrite the newer one's result.
  let latest: Promise<T> | undefined;
  function Suspense_promise(newPromise: Promise<T>) {
    latest = newPromise;
    state.value = 0;
    newPromise.then(
      (value) => {
        if (latest !== newPromise) return;
        successValue.value = value;
        state.value = 1;
      },
      (err) => {
        if (latest !== newPromise) return;
        errorValue.value = err;
        state.value = 2;
      },
    );
  }

  return Fragment({
    children: [
      isReactive(promise)
        ? Watch({
            value: promise,
            children: Suspense_promise,
          })
        : effect(function Suspense_onMount() {
            Suspense_promise(promise());
          }),
      OneOf({
        selector: state,
        children: [loading ?? successElement, successElement, error?.(errorValue) ?? successElement],
      }),
    ],
  });
}

/**
 * Catches the errors of everything mounted under it and renders `fallback` instead: a child that throws as it mounts, and a
 * reactive callback that throws on a later change (a `select` function, a `Watch` or `Effect` body, the functions of a `List`,
 * `OneOf`, `If` or `Dynamic`). The nearest boundary wins, and an error thrown by the fallback itself goes to the handler outside
 * this boundary. Not covered: an event handler, a timer, or a promise callback, which run outside any mount or subscription.
 *
 * It works by providing its error handler while it mounts its children, and every subscription made then remembers that handler
 * (see {@link handleError}).
 */
export function ErrorBoundary({
  fallback,
  ...props
}: {
  fallback: (err: ReactiveReadonly<unknown>) => JSXElement;
} & ChildrenProp): JSXElement {
  const children = Fragment(props);
  const errorValue = reactive<unknown>();
  const switcher = OneOf({
    selector: select(errorValue, (x) => (x == null ? 0 : 1)),
    children: [children, fallback(errorValue)],
  });
  return function ErrorBoundary_element(parent, sibling) {
    const outer = getErrorHandler();
    return withErrorHandler(
      function ErrorBoundary_onError(err) {
        if (errorValue.value == null) {
          errorValue.value = err;
        } else {
          // Already showing the fallback: this is the fallback's own error, which is for whoever is outside.
          outer(err);
        }
      },
      () => switcher(parent, sibling),
    );
  };
}

/** The `[parent, sibling]` mount position captured by a {@link PortalTarget}, or `undefined` if it isn't mounted. */
export type PortalTargetValue = readonly [Node, Node | null] | undefined;

/**
 * Marks a spot in the tree for a {@link Portal} to render into. Renders nothing itself; assign
 * its position (via `ref`) to a reactive value and pass that to a `Portal`'s `target` prop.
 */
export function PortalTarget(props: RefProp<PortalTargetValue>): JSXElement {
  return dynamic(
    function PortalTarget_mount(parent, sibling) {
      setRef(props, [parent, sibling]);
    },
    function PortalTarget_unmount() {
      setRef(props, undefined);
    },
  );
}

/**
 * Renders `children` into the position captured by a {@link PortalTarget}, wherever that is in
 * the DOM. Since the captured position is a pair of live node references rather than a snapshot,
 * this keeps working correctly even if the target is later moved (e.g. as part of a reordering
 * {@link List}).
 */
export function Portal({
  target,
  ...props
}: {
  target: Reactive<PortalTargetValue>;
} & ChildrenProp): JSXElement {
  const children = Fragment(props);
  const Portal_effect = () => {
    const unsubscribe = subscribeWithCatch(target, function Portal_target(newValue) {
      if (newValue) {
        const [parent, sibling] = newValue;
        children(parent, sibling);
      } else {
        children();
      }
    });
    return function Portal_cleanup() {
      unsubscribe();
      children();
    };
  };
  return effect(Portal_effect);
}

/**
 * Renders its children into the document head.
 */
export function Helmet(props: ChildrenProp): JSXElement {
  const children = Fragment(props);
  let mounted = false;
  return function Helmet_element(parent, sibling = null) {
    if (parent && !mounted) {
      const { head } = document;
      // This ensures new Helmet children are inserted at the beginning, so they take priority.
      children(head, head.firstChild);
      mounted = true;
    } else if (!parent && mounted) {
      children();
      mounted = false;
    }
    return sibling;
  };
}
