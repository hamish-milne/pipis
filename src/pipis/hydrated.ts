/// <reference lib="dom" />

// What the library does differently where a page that a server wrote is being hydrated: `createElement` for an element that adopts a node
// instead of making one. It is used only under `IS_HYDRATE`, a constant, so a build for the browser or the server has none of it; see
// docs/adr/0021-hydration.md. The rest of the platform that the seams use is re-exported here, so that they have one place to import it from.
import { type Cleanup, type JSXElement, type Reactive, isReactive, moveNode, setRef, subscribe } from './base.ts';
import type { PropBag, PropValue } from './internal.ts';
import { bounded, claimElement, createNode, defer, hydrating, setAttribute, sweep } from './platform.hydrate.ts';

export { adoptRange, claimRegion, defer, hydrating, plain } from './platform.hydrate.ts';

/** A prop of an element, which is given when it is mounted: its own, or one of its `style`'s. */
interface Prop {
  style: boolean;
  key: string;
}

interface Binding extends Prop {
  value: Reactive<PropValue>;
  cleanup?: Cleanup | null;
}

// A form control that the person has changed since the page was written is not given the value the page says: they were there first.
// The properties that tell are the control's own: `defaultValue` is what the markup says, and `value` what is in the control.
const FORM_PROPS: Record<string, [current: string, markup: string]> = {
  value: ['value', 'defaultValue'],
  checked: ['checked', 'defaultChecked'],
  selected: ['selected', 'defaultSelected'],
};

function isDirty(element: Element, key: string) {
  const names = FORM_PROPS[key];
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the control's own properties, named in the table above
  const control = element as unknown as Record<string, unknown>;
  return names !== undefined && names[0] in control && control[names[0]] !== control[names[1]];
}

/**
 * `createElement` for a build that hydrates. The element is not made when it is built but when it is mounted, because it is then that its
 * place in its parent is known, which is how the node that the server wrote for it is found. What it is given, it is given on that mount:
 * the props, and, when the hydration is done, the `ref`.
 */
export function hydratedElement(type: string, props: PropBag, children: JSXElement): JSXElement {
  let element: Element | undefined;
  const statics: (Prop & { value: PropValue })[] = [];
  const bindings: Binding[] = [];
  let refSet = false;
  let refQueued = false;

  const collect = (value: PropValue | Reactive<PropValue>, key: string, style: boolean) => {
    if (isReactive(value)) bindings.push({ style, key, value });
    else statics.push({ style, key, value });
  };
  for (const key in props) {
    if (key === 'children' || key === 'ref') continue;
    const value = props[key];
    if (key === 'style') {
      const styles: PropBag = value;
      for (const nestedKey in styles) collect(styles[nestedKey], nestedKey, true);
    } else {
      collect(value, key, false);
    }
  }

  const apply = (node: Element, { style, key }: Prop, newValue: PropValue) => {
    if (hydrating() && isDirty(node, key)) return;
    // oxlint-disable-next-line typescript/consistent-type-assertions -- `style` is on the HTML and SVG elements that props can name it for
    setAttribute(style ? (node as HTMLElement).style : node, key, newValue);
  };
  const subscribeAll = (node: Element) => {
    for (const b of bindings) {
      if (!b.cleanup) {
        b.cleanup = subscribe(b.value, function hydratedElement_binding(newValue) {
          apply(node, b, newValue);
        });
      }
    }
  };
  const giveRef = () => {
    if (refSet || !element) return;
    refSet = true;
    setRef(props, element);
  };

  return function hydratedElement_element(parent, sibling = null) {
    if (!element) {
      if (!parent) return sibling;
      const node = hydrating() ? claimElement(type, parent, sibling) : createNode(type);
      element = node;
      for (const p of statics) apply(node, p, p.value);
      if (hydrating()) {
        // The ref is for a page that is whole, and a state written as it is mounted is refused.
        if (!refQueued) {
          refQueued = true;
          defer(giveRef);
        }
      } else {
        giveRef();
      }
      moveNode(node, parent, sibling);
      subscribeAll(node);
      bounded(null, () => children(node));
      // A textarea's text is its value, which a server writes as text and the app gives as a prop: it is not an extra node.
      if (hydrating() && type !== 'textarea') sweep(node);
      return node;
    }
    if (moveNode(element, parent, sibling)) {
      if (parent) {
        subscribeAll(element);
      } else {
        for (const b of bindings) {
          b.cleanup?.();
          b.cleanup = null;
        }
      }
      children(parent && element);
    }
    return parent ? element : sibling;
  };
}
