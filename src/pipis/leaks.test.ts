import { describe, expect, it } from 'vite-plus/test';
import { Fragment, textNode, type JSXElement } from './core.ts';
import { select } from './reactive.ts';
import { Dynamic, ErrorBoundary, If, List, OneOf, Portal, ReactiveList, Suspense, Watch, type PortalTargetValue } from './dynamic.ts';
import { h, html, mount, tracked } from '../test/dom.ts';

/**
 * Every element that subscribes to something is built here over a tracked reactive. Mounting must subscribe, and unmounting must
 * leave nothing subscribed and nothing in the DOM: a subscriber left behind keeps its DOM node and its closure alive for as long
 * as the reactive lives, and keeps doing work for a node nobody can see.
 */
type Case = { name: string; build: (input: ReturnType<typeof tracked<string>>) => JSXElement };

const cases: Case[] = [
  { name: 'textNode', build: (input) => textNode(input.reactive) },
  { name: 'Fragment of text nodes', build: (input) => Fragment({ children: [textNode(input.reactive), textNode('-')] }) },
  { name: 'an element’s prop', build: (input) => h('div', { title: input.reactive }) },
  { name: 'an element’s style', build: (input) => h('div', { style: { color: input.reactive } }) },
  { name: 'an element’s data attribute', build: (input) => h('div', { 'data-x': input.reactive }) },
  {
    name: 'List',
    build: (input) =>
      List({
        items: select(input.reactive, (v) => [v, `${v}!`]),
        itemKey: (v) => v,
        children: (v) => textNode(v),
      }),
  },
  {
    name: 'ReactiveList',
    build: (input) =>
      ReactiveList({
        items: select(input.reactive, (v) => [{ id: v }, { id: `${v}!` }]),
        itemKey: (item) => item.id,
        children: (item) => textNode(select(item, 'id')),
      }),
  },
  { name: 'OneOf', build: (input) => OneOf({ selector: input.reactive, children: { a: textNode('a') } }) },
  { name: 'If', build: (input) => If({ condition: select(input.reactive, (v) => v === 'a'), children: textNode('shown') }) },
  { name: 'Dynamic', build: (input) => Dynamic({ value: input.reactive, children: (v) => textNode(v) }) },
  { name: 'Watch', build: (input) => Watch({ value: input.reactive, children: () => {} }) },
  {
    name: 'Portal',
    build: (input) => {
      const place = document.createElement('section');
      return Portal({
        target: select(input.reactive, (): PortalTargetValue => [place, null]),
        children: textNode('moved'),
      });
    },
  },
  {
    name: 'Suspense with a reactive promise',
    build: (input) =>
      Suspense({
        promise: select(input.reactive, (v) => Promise.resolve(v)),
        emptyData: '',
        children: (data) => textNode(data),
      }),
  },
  { name: 'ErrorBoundary', build: (input) => ErrorBoundary({ fallback: () => textNode('fallback'), children: textNode(input.reactive) }) },
  {
    name: 'an If around a List of text nodes',
    build: (input) =>
      If({
        condition: select(input.reactive, (v) => v === 'a'),
        children: List({ items: select(input.reactive, (v) => [v]), itemKey: (v) => v, children: (v) => textNode(v) }),
      }),
  },
];

describe('nothing is left subscribed after unmount', () => {
  for (const { name, build } of cases) {
    it(name, () => {
      const input = tracked('a');
      const { root, unmount } = mount(build(input));
      expect(input.active, 'mounting subscribes').toBeGreaterThan(0);
      input.state.value = 'b';
      input.state.value = 'a';
      unmount();
      expect(input.active, 'unmounting unsubscribes').toBe(0);
      expect(html(root)).toBe('');
    });
  }
});

describe('mounting again after unmount', () => {
  for (const { name, build } of cases) {
    it(`${name} subscribes once, however many times it has been mounted`, () => {
      const input = tracked('a');
      const element = build(input);
      const { root, unmount } = mount(element);
      const once = input.active;
      for (let i = 0; i < 5; i++) {
        unmount();
        element(root);
      }
      expect(input.active).toBe(once);
      unmount();
      expect(input.active).toBe(0);
    });
  }
});

describe('what is inside an element', () => {
  // The same check as above, with the thing under test one level down inside an element. The element's own bindings are undone
  // on unmount, but it mounts its children again instead of unmounting them, so everything inside it stays subscribed.
  for (const { name, build } of cases) {
    it(`${name} inside a div is unsubscribed when the div is unmounted`, () => {
      const input = tracked('a');
      const { unmount } = mount(h('div', {}, build(input)));
      unmount();
      expect(input.active).toBe(0);
    });
  }
});
