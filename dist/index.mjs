//#region src/pipis/core.ts
/** Brand symbol used to identify {@link Reactive} values at runtime; see {@link isReactive}. */
const REACTIVE = Symbol();
/** An alternative to directly calling `subscribe` on a {@link Reactive} value, purely to optimize bundle size. */
function subscribe(reactive, callback) {
	return reactive.subscribe(callback);
}
/** Runtime type guard for {@link Reactive} values, based on the {@link REACTIVE} brand. */
const isReactive = (value) => value?.[REACTIVE] === true;
/** A {@link JSXElement} that renders nothing; on mount, returns `sibling` unchanged. */
const emptyElement = (parent, sibling = null) => sibling;
/**
* Renders a `<>...</>` fragment: a sequence of children with no wrapping DOM node.
* Collapses to the child itself (or {@link emptyElement}) when there are 0 or 1 children,
* so it adds no overhead - and no extra stack frame - for the common case.
*
* Because of these optimizations, Fragments only support a static list of children. If
* the structure should be dynamic, consider {@link List}, {@link ReactiveChildren}, or other
* dynamic rendering utilities.
*/
function Fragment({ children }) {
	let childElements = [];
	for (const child of children instanceof Array ? children : [children]) if (child != null && child !== false) childElements.push(typeof child === "function" ? child : textNode(child));
	childElements.reverse();
	if (childElements.length <= 1) return childElements[0] ?? emptyElement;
	return function Fragment_element(parent, sibling = null) {
		let head = sibling;
		for (const child of childElements) head = child(parent, head);
		return head;
	};
}
/**
* Moves a node to a different position in the DOM, if needed.
*/
function moveNode(element, parent, sibling) {
	const prevParent = element.parentNode;
	if (prevParent != parent || sibling !== void 0 && element.nextSibling != sibling) {
		if (parent) parent.insertBefore(element, sibling ?? null);
		else prevParent?.removeChild(element);
		return true;
	}
	return false;
}
function setText(node, content) {
	node.data = String(content ?? "");
}
/**
* Creates a text node that can reactively update its content if given a reactive value.
*/
function textNode(content) {
	const node = document.createTextNode("");
	let contentReactive;
	if (isReactive(content)) contentReactive = content;
	else setText(node, content);
	let cleanup;
	return function textNode_element(parent, sibling = null) {
		if (parent) cleanup ??= contentReactive && subscribe(contentReactive, function textNode_binding(newValue) {
			setText(node, newValue);
		});
		else {
			cleanup?.();
			cleanup = void 0;
		}
		moveNode(node, parent, sibling);
		return parent ? node : sibling;
	};
}
/**
* Creates a `Comment` node to use as a stable anchor point in the DOM. Useful for implementing
* elements whose content can change shape over time - mount the marker once as the element's
* fixed head, and insert/remove/reorder actual content around it as needed.
*/
const createMarker = (text = "") => document.createComment(text);
/** Invokes a `ref` prop, whether it's a callback or a settable `{ value }` object. */
function setRef(props, value) {
	const { ref } = props;
	if (typeof ref === "function") ref(value);
	else if (ref) ref.value = value;
}
function setAttribute(element, key, value) {
	if (key.startsWith("data-")) {
		const { dataset } = element;
		const name = key.slice(5);
		if (value == null || value === false) delete dataset[name];
		else dataset[name] = value;
	} else element[key] = value;
}
/**
* Renders an intrinsic (HTML/SVG/MathML tag) element. Static props are set once at construction;
* {@link Reactive} props are subscribed on mount and unsubscribed on unmount. The underlying DOM
* node is created once and reused across mount/unmount/remount calls.
*/
function createElement(type, props) {
	const element = document.createElement(type);
	const bindings = [];
	for (const key in props) {
		if (key === "children" || key === "ref") continue;
		const value = props[key];
		if (isReactive(value)) bindings.push([
			key,
			value,
			null
		]);
		else setAttribute(element, key, value);
	}
	setRef(props, element);
	const children = Fragment(props);
	return function jsxIntrinsic_element(parent, sibling = null) {
		if (moveNode(element, parent, sibling)) {
			if (parent) for (const b of bindings) {
				const [key, reactive] = b;
				b[2] ??= subscribe(reactive, function jsxIntrinsic_binding(newValue) {
					setAttribute(element, key, newValue);
				});
			}
			else for (const b of bindings) {
				b[2]?.();
				b[2] = null;
			}
			children(element);
		}
		return parent ? element : sibling;
	};
}
//#endregion
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
