/// <reference lib="dom" />

// What the library's own modules share and an app has no use for: they are not exported from `pipis`, which is why they are not in base.ts
// (the barrel re-exports all of that).
import type { Content } from './base.ts';

/** Whether a value stands for "nothing": `null`, `undefined` and `false` render as empty text and remove an attribute. */
export function isEmpty(value: unknown): value is null | undefined | false {
  return value == null || value === false;
}

/**
 * The props that are attributes, not properties: `data-*` and `aria-*`. The DOM has no property for them under these names (an ARIA one is
 * `ariaLabel`), so they are set as attributes, and a missing value takes the attribute off.
 */
export const ATTRIBUTE_PROP = /^(data|aria)-/;

/** Puts content into a text node: nothing for an empty value, and the text of any other. */
export function setText(node: { data: string }, content: Content) {
  node.data = isEmpty(content) ? '' : String(content);
}

/** What a prop can hold once it is not reactive: anything the DOM coerces to a string, or a value it takes as it is. */
export type PropValue = string | number | boolean | null | undefined;

// The props are read by name, and their type is the union of every element's props, so there is nothing narrower to say here.
/** The props of an intrinsic element, as a platform reads them. */
// oxlint-disable-next-line typescript/no-explicit-any
export type PropBag = Record<string, any>;
