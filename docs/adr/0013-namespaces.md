# 13. HTML is tried first, then SVG; MathML is not supported

**Decision.** `createElement` creates an HTML element with `document.createElement`, and if the tag is not an HTML element (the result is
`HTMLUnknownElement`) it creates the element in the SVG namespace. A tag that is neither is therefore an `SVGElement`, not an
`HTMLUnknownElement`; the types do not allow one, so it should not occur in a real app. A custom element name (`my-widget`) is a plain
`HTMLElement` and stays HTML. MathML tags are accepted by the types but are created as unknown HTML elements.

**Why.** SVG has no "unknown element" class to ask for, but HTML does. MathML elements all share one class, `MathMLElement`, so nothing
tells a real MathML tag from a typo without a list of tag names, which costs bytes and is not worth it.

**Alternative considered: SVG first.** Create the element in the SVG namespace and keep it if its class is not the generic `SVGElement`,
which would leave an unknown tag as `HTMLUnknownElement`. Measured against every tag in the DOM typings (63 SVG, 112 HTML):

- In Chromium the prototype check is valid for all 63 SVG tags, and no HTML tag is an unknown element.
- Four tags exist in both namespaces: `a`, `script`, `style` and `title`. SVG first would create the HTML ones as SVG elements (an `<a>` that
  is not a link), so it needs a list of exceptions, which is the cost it was meant to avoid.
- In jsdom 55 of the 63 SVG tags are the generic `SVGElement` (only `svg` and `title` have classes), so SVG first would create `circle`,
  `g`, `path` and the rest as HTML elements there, which breaks the tests of any app that renders SVG under jsdom.

HTML first has neither problem: it works the same in both DOMs and needs no list.

**Evidence.** `core.test.ts`, "namespaces": HTML tags are in the HTML namespace; `svg`, `circle` and `g` are in the SVG namespace (in jsdom
and in Chromium); a custom element name is HTML; an invalid tag is an `SVGElement`. HTML props (`className`, `disabled`, `value`) are
properties; SVG attributes go through `setAttribute`.

**Consequences.** MathML support would need an explicit tag list.
