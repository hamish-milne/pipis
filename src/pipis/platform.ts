// The contract of a platform: what the nodes of an element are made with. Types only.
//
// Every platform module (`platform.client.ts`, `platform.server.ts`) exports exactly these names, and `src/types/platform.check.ts`
// compiles each against this interface, so the two cannot drift. Which one an app gets is the bundler's choice, made through the
// package's `#platform` import (see docs/adr/0019-server-rendering.md): the browser's by default, the server's under the `pipis-server`
// condition.
import type { Content, JSXElement, Reactive } from './base.ts';
import type { PropValue } from './internal.ts';

export interface Platform {
  /** Whether the code runs in a browser: a constant on each platform, so a branch that is not taken is removed from the bundle. */
  readonly IS_CLIENT: boolean;

  /** Whether the code runs on a server: the other side of `IS_CLIENT`. */
  readonly IS_SERVER: boolean;

  /** Whether a page that a server wrote is adopted as it is mounted: a browser's platform that hydrates. */
  readonly IS_HYDRATE: boolean;

  /** A text node that follows a reactive value. */
  textNode(content: Content | Reactive<Content>): JSXElement;

  /** A comment node, the stable anchor of a region whose content changes. */
  createMarker(text?: string): Comment;

  /** A new element for the tag `type`. */
  createNode(type: string): Element;

  /** Sets a prop of an element, or of its `style`, the way the platform's nodes want it (an attribute, or a property). */
  setAttribute(target: Element | CSSStyleDeclaration, key: string, value: PropValue): void;

  /** Where `Helmet` renders: the document's head in a browser, the render's own head on a server. */
  head(): Node;
}
