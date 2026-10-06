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
} from "./core";
import {
  handleError,
  reactive,
  select,
  subscribeWithCatch,
  withErrorHandler,
  type ReactiveReadonly,
} from "./reactive";

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
    if (moveNode(marker, parent) || sibling !== nextSibling) {
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

/**
 * Renders items from an array, keyed by `itemKey` so items can be added, removed, and reordered
 * without recreating unaffected items. Each item is (re-)mounted on every update by iterating
 * back-to-front and chaining each item's returned head node as the next item's `sibling`; combined
 * with {@link moveNode}, an item only costs a real DOM operation when it actually moved.
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
  const renderedItems = new Map<PropertyKey, JSXElement>();
  const List_mount: MountFn = (parent, sibling) =>
    subscribeWithCatch(items, function List_items(newItems) {
      const newKeys = newItems.map(itemKey);
      for (const [key, item] of renderedItems) {
        if (newKeys.indexOf(key) === -1) {
          item?.();
          renderedItems.delete(key);
        }
      }
      let head = sibling;
      for (let index = newItems.length - 1; index >= 0; index--) {
        const item = newItems[index];
        const k = newKeys[index];
        let itemElement = renderedItems.get(k);
        if (!itemElement) {
          itemElement = children(item, index);
          renderedItems.set(k, itemElement);
        }
        head = itemElement(parent, head);
      }
    });
  return dynamic(List_mount, function List_unmount() {
    for (const [, item] of renderedItems) {
      item();
    }
    renderedItems.clear();
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
export function Dynamic<T>({
  value,
  children,
}: {
  value: Reactive<T>;
  children: (props: T) => JSXElement;
}): JSXElement {
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

/** Renders nothing, but runs `fn` on mount and its returned cleanup (if any) on unmount. */
export function effect(fn: () => Cleanup | undefined): JSXElement {
  let cleanup: Cleanup | undefined;
  const fnWrapped = handleError(fn);
  return function Effect_element(parent, sibling = null) {
    if (parent) {
      cleanup ??= fnWrapped();
    } else {
      cleanup?.();
      cleanup = undefined;
    }
    return sibling;
  };
}

/** JSX-friendly wrapper around {@link effect}, for running a side effect on mount/unmount. */
export const Effect = (props: { children: () => Cleanup | undefined }): JSXElement =>
  effect(props.children);

/** Runs `children` with the current value on mount, and again on every subsequent change. */
export function Watch<T>({
  value,
  children,
}: {
  value: Reactive<T>;
  children: (newValue: T) => void;
}): JSXElement {
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

  function Suspense_promise(newPromise: Promise<T>) {
    state.value = 0;
    newPromise.then(
      (value) => {
        successValue.value = value;
        state.value = 1;
      },
      (err) => {
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
        children: [
          loading ?? successElement,
          successElement,
          error?.(errorValue) ?? successElement,
        ],
      }),
    ],
  });
}

/**
 * Catches errors thrown synchronously while mounting `children` and renders `fallback` instead.
 * Only covers the mount call itself - errors thrown later, e.g. from a reactive binding's
 * subscriber callback or an {@link Effect}, are not caught. Use a global error handler (such as
 * `window.onerror`) alongside a reactive flag for those cases.
 */
export function ErrorBoundary({
  fallback,
  ...props
}: {
  fallback: (err: ReactiveReadonly<unknown>) => JSXElement;
} & ChildrenProp): JSXElement {
  const children = Fragment(props);
  const errorValue = reactive<unknown>();
  const ErrorBoundary_construct = () =>
    OneOf({
      selector: select(errorValue, (x) => (x == null ? 0 : 1)),
      children: [children, fallback(errorValue)],
    });
  return withErrorHandler(function ErrorBoundary_onError(err) {
    errorValue.value = err;
  }, ErrorBoundary_construct);
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
  const Portal_effect = () =>
    subscribeWithCatch(target, function Portal_target(newValue) {
      if (newValue) {
        const [parent, sibling] = newValue;
        children(parent, sibling);
      }
    });
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
