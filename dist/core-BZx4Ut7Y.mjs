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
export { emptyElement as a, setRef as c, createMarker as i, subscribe as l, REACTIVE as n, isReactive as o, createElement as r, moveNode as s, Fragment as t, textNode as u };
