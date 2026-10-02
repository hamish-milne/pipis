import { a as emptyElement, c as setRef, i as createMarker, l as subscribe, n as REACTIVE, o as isReactive, r as createElement, s as moveNode, t as Fragment, u as textNode } from "./core-BZx4Ut7Y.mjs";
//#region src/pipis/reactive.ts
/**
* Adapts an object with a `subscribe` method to be recognized as a reactive object by setting the `[REACTIVE]` property.
*/
function adapt(obj) {
	return Object.assign(obj, { [REACTIVE]: true });
}
var ReactiveStateImpl = class {
	constructor(initialValue) {
		this[REACTIVE] = true;
		this._s = /* @__PURE__ */ new Set();
		this._v = initialValue;
	}
	get value() {
		return this._v;
	}
	set value(newValue) {
		if (this._v !== newValue) {
			this._v = newValue;
			for (const callback of this._s) callback(newValue);
		}
	}
	subscribe(callback) {
		this._s.add(callback);
		callback(this.value);
		const binding_cleanup = () => {
			this._s.delete(callback);
		};
		return binding_cleanup;
	}
};
function reactive(initialValue) {
	return new ReactiveStateImpl(initialValue);
}
const UNDEFINED = Symbol();
var ReactiveSelect = class {
	constructor(input, compute) {
		this[REACTIVE] = true;
		this._i = input;
		this._c = compute;
	}
	subscribe(callback) {
		let prevValue = UNDEFINED;
		const SelectBinding_subscribe = (newValue) => {
			const newOut = this._c(newValue);
			if (newOut !== prevValue) {
				prevValue = newOut;
				callback(prevValue);
			}
		};
		return this._i.subscribe(SelectBinding_subscribe);
	}
};
function select(input, compute) {
	return new ReactiveSelect(input, typeof compute === "function" ? compute : (input) => input[compute]);
}
var ReactiveConstant = class {
	constructor(value) {
		this[REACTIVE] = true;
		this._v = value;
	}
	get value() {
		return this._v;
	}
	subscribe(callback) {
		callback(this._v);
		return () => {};
	}
};
/** Wraps a static value as a {@link ReactiveReadonly}, for APIs that require a reactive input. */
const constant = (value) => new ReactiveConstant(value);
function defineContext(defaultValue) {
	const stack = [defaultValue];
	function context_provider(value, inner) {
		stack.push(value);
		try {
			return inner();
		} finally {
			stack.pop();
		}
	}
	const context_consumer = () => stack[stack.length - 1];
	return [context_provider, context_consumer];
}
const [withErrorHandler, getErrorHandler] = defineContext(console.error);
function handleError(fn, err) {
	return function handleError_wrapper(...args) {
		try {
			return fn(...args);
		} catch (error) {
			getErrorHandler()(error);
			return err;
		}
	};
}
function subscribeWithCatch(reactive, callback) {
	return reactive.subscribe(handleError(callback));
}
//#endregion
//#region src/pipis/dynamic.ts
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
function dynamic(mount, unmount) {
	const marker = createMarker();
	let cleanup;
	let nextSibling = null;
	return function Dynamic_element(parent, sibling = null) {
		if (moveNode(marker, parent) || sibling !== nextSibling) {
			cleanup?.();
			if (parent) cleanup = mount(parent, sibling);
			else {
				cleanup = void 0;
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
function List({ items, itemKey, children }) {
	const renderedItems = /* @__PURE__ */ new Map();
	const List_mount = (parent, sibling) => subscribeWithCatch(items, function List_items(newItems) {
		const newKeys = newItems.map(itemKey);
		for (const [key, item] of renderedItems) if (newKeys.indexOf(key) === -1) {
			item?.();
			renderedItems.delete(key);
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
		for (const [, item] of renderedItems) item();
		renderedItems.clear();
	});
}
/** Mounts one of several elements, chosen by `selector`, unmounting the previous choice on change. */
function OneOf({ selector, children }) {
	let current;
	const OneOf_mount = (parent, sibling) => subscribeWithCatch(selector, function OneOf_value(newValue) {
		current?.();
		current = children[newValue];
		if (current && parent) current(parent, sibling);
	});
	return dynamic(OneOf_mount, function OneOf_unmount() {
		current?.();
		current = void 0;
	});
}
/** Conditionally renders its child based on a boolean reactive value. */
function If({ condition, ...props }) {
	const children = Fragment(props);
	const If_mount = (parent, sibling) => subscribeWithCatch(condition, function If_value(newValue) {
		if (newValue) children(parent, sibling);
		else children();
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
function Dynamic({ value, children }) {
	let current;
	const Dynamic_mount = (parent, sibling) => subscribeWithCatch(value, function Dynamic_value(newValue) {
		current?.();
		current = children(newValue);
		if (current && parent) current(parent, sibling);
	});
	return dynamic(Dynamic_mount, function Dynamic_unmount() {
		current?.();
		current = void 0;
	});
}
/** Renders nothing, but runs `fn` on mount and its returned cleanup (if any) on unmount. */
function effect(fn) {
	let cleanup;
	const fnWrapped = handleError(fn);
	return function Effect_element(parent, sibling = null) {
		if (parent) cleanup ??= fnWrapped();
		else {
			cleanup?.();
			cleanup = void 0;
		}
		return sibling;
	};
}
/** JSX-friendly wrapper around {@link effect}, for running a side effect on mount/unmount. */
const Effect = (props) => effect(props.children);
/** Runs `children` with the current value on mount, and again on every subsequent change. */
function Watch({ value, children }) {
	const Watch_effect = () => subscribeWithCatch(value, function Watch_value(newValue) {
		children(newValue);
	});
	return effect(Watch_effect);
}
/**
* Renders `children` (or `success`, if omitted) while `promise` is pending, `success` once it
* resolves, and `error` if it rejects. Does not offer timeout/retry/streaming; for that level of
* control, consider a dedicated data-fetching library layered on top.
*/
function Suspense({ promise, placeholder, success, error, ...props }) {
	const state = reactive(0);
	const successValue = reactive(placeholder);
	const errorValue = reactive();
	const successElement = success(successValue);
	function Suspense_promise(newPromise) {
		state.value = 0;
		newPromise.then((value) => {
			successValue.value = value;
			state.value = 1;
		}, (err) => {
			errorValue.value = err;
			state.value = 2;
		});
	}
	return Fragment({ children: [isReactive(promise) ? Watch({
		value: promise,
		children: Suspense_promise
	}) : effect(function Suspense_onMount() {
		Suspense_promise(promise());
	}), OneOf({
		selector: state,
		children: [
			props.children ? Fragment(props) : successElement,
			successElement,
			error?.(errorValue) ?? successElement
		]
	})] });
}
/**
* Catches errors thrown synchronously while mounting `children` and renders `fallback` instead.
* Only covers the mount call itself - errors thrown later, e.g. from a reactive binding's
* subscriber callback or an {@link Effect}, are not caught. Use a global error handler (such as
* `window.onerror`) alongside a reactive flag for those cases.
*/
function ErrorBoundary({ fallback, ...props }) {
	const children = Fragment(props);
	const errorValue = reactive();
	const ErrorBoundary_construct = () => OneOf({
		selector: select(errorValue, (x) => x == null ? 0 : 1),
		children: [children, fallback(errorValue)]
	});
	return withErrorHandler(function ErrorBoundary_onError(err) {
		errorValue.value = err;
	}, ErrorBoundary_construct);
}
/**
* Marks a spot in the tree for a {@link Portal} to render into. Renders nothing itself; assign
* its position (via `ref`) to a reactive value and pass that to a `Portal`'s `target` prop.
*/
function PortalTarget(props) {
	return dynamic(function PortalTarget_mount(parent, sibling) {
		setRef(props, [parent, sibling]);
	}, function PortalTarget_unmount() {
		setRef(props, void 0);
	});
}
/**
* Renders `children` into the position captured by a {@link PortalTarget}, wherever that is in
* the DOM. Since the captured position is a pair of live node references rather than a snapshot,
* this keeps working correctly even if the target is later moved (e.g. as part of a reordering
* {@link List}).
*/
function Portal({ target, ...props }) {
	const children = Fragment(props);
	const Portal_effect = () => subscribeWithCatch(target, function Portal_target(newValue) {
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
function Helmet(props) {
	const children = Fragment(props);
	let mounted = false;
	return function Helmet_element(parent, sibling = null) {
		if (parent && !mounted) {
			const { head } = document;
			children(head, head.firstChild);
			mounted = true;
		} else if (!parent && mounted) {
			children();
			mounted = false;
		}
		return sibling;
	};
}
//#endregion
export { Dynamic, Effect, ErrorBoundary, Fragment, Helmet, If, List, OneOf, Portal, PortalTarget, REACTIVE, Suspense, Watch, adapt, constant, createElement, createMarker, defineContext, dynamic, effect, emptyElement, getErrorHandler, handleError, isReactive, moveNode, reactive, select, setRef, subscribe, subscribeWithCatch, textNode, withErrorHandler };
