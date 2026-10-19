// ==========================================
// 1. Base Attribute Sets
// ==========================================

export interface SVGGlobalAttributes {
  id?: string;
  class?: string;
  tabindex?: string | number;
  lang?: string;
  role?: string;
  style?: string;
  "data-*"?: string; // Caught dynamically in practice, represented here as an index/placeholder
  [key: `data-${string}`]: string | undefined;
}

// Presentation attributes (Styling that can be set as markup attributes)
export interface SVGPresentationAttributes {
  "alignment-baseline"?: string;
  "clip-path"?: string;
  "clip-rule"?: string;
  color?: string;
  cursor?: string;
  direction?: string;
  display?: string;
  "dominant-baseline"?: string;
  fill?: string;
  "fill-opacity"?: string | number;
  "fill-rule"?: "nonzero" | "evenodd" | "inherit";
  filter?: string;
  "font-family"?: string;
  "font-size"?: string | number;
  "font-style"?: string;
  "font-weight"?: string | number;
  "letter-spacing"?: string | number;
  mask?: string;
  opacity?: string | number;
  overflow?: string;
  "pointer-events"?: string;
  stroke?: string;
  "stroke-dasharray"?: string | number;
  "stroke-dashoffset"?: string | number;
  "stroke-linecap"?: "butt" | "round" | "square" | "inherit";
  "stroke-linejoin"?: "miter" | "round" | "bevel" | "inherit";
  "stroke-miterlimit"?: string | number;
  "stroke-opacity"?: string | number;
  "stroke-width"?: string | number;
  "text-anchor"?: "start" | "middle" | "end" | "inherit";
  "text-decoration"?: string;
  transform?: string;
  "transform-origin"?: string;
  vector_effect?:
    | "none"
    | "non-scaling-stroke"
    | "non-scaling-size"
    | "non-rotation"
    | "fixed-position";
  visibility?: "visible" | "hidden" | "collapse" | "inherit";
  "writing-mode"?: string;
}

// Intermediate type for standard visual/renderable elements
export interface SVGGraphicsElementAttributes
  extends SVGGlobalAttributes, SVGPresentationAttributes {}

// Intermediate type for structural/container elements
export interface SVGContainerElementAttributes extends SVGGraphicsElementAttributes {}

// Intermediate type for structural text descriptors
export interface SVGTextContentElementAttributes extends SVGGraphicsElementAttributes {
  dx?: string | number;
  dy?: string | number;
  x?: string | number;
  y?: string | number;
}

// ==========================================
// 2. Specific Element Attribute Maps
// ==========================================

export interface SVGAElementAttributes extends SVGContainerElementAttributes {
  href?: string;
  target?: string;
  download?: string;
  rel?: string;
}

export interface SVGCircleElementAttributes extends SVGGraphicsElementAttributes {
  cx?: string | number;
  cy?: string | number;
  r?: string | number;
}

export interface SVGClipPathElementAttributes extends SVGGlobalAttributes {
  clipPathUnits?: "userSpaceOnUse" | "objectBoundingBox";
}

export interface SVGDefsElementAttributes extends SVGContainerElementAttributes {}

export interface SVGEllipseElementAttributes extends SVGGraphicsElementAttributes {
  cx?: string | number;
  cy?: string | number;
  rx?: string | number;
  ry?: string | number;
}

export interface SVGFilterElementAttributes extends SVGGlobalAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  filterUnits?: "userSpaceOnUse" | "objectBoundingBox";
  primitiveUnits?: "userSpaceOnUse" | "objectBoundingBox";
}

export interface SVGGElementAttributes extends SVGContainerElementAttributes {}

export interface SVGImageElementAttributes extends SVGGraphicsElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  href?: string;
  preserveAspectRatio?: string;
}

export interface SVGLineElementAttributes extends SVGGraphicsElementAttributes {
  x1?: string | number;
  y1?: string | number;
  x2?: string | number;
  y2?: string | number;
}

export interface SVGLinearGradientElementAttributes extends SVGGlobalAttributes {
  x1?: string | number;
  y1?: string | number;
  x2?: string | number;
  y2?: string | number;
  gradientUnits?: "userSpaceOnUse" | "objectBoundingBox";
  gradientTransform?: string;
  spreadMethod?: "pad" | "reflect" | "repeat";
  href?: string;
}

export interface SVGMaskElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  maskUnits?: "userSpaceOnUse" | "objectBoundingBox";
  maskContentUnits?: "userSpaceOnUse" | "objectBoundingBox";
}

export interface SVGPathElementAttributes extends SVGGraphicsElementAttributes {
  d?: string;
  pathLength?: string | number;
}

export interface SVGPatternElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  patternUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternContentUnits?: "userSpaceOnUse" | "objectBoundingBox";
  patternTransform?: string;
  viewBox?: string;
  preserveAspectRatio?: string;
  href?: string;
}

export interface SVGPolygonElementAttributes extends SVGGraphicsElementAttributes {
  points?: string;
}

export interface SVGPolylineElementAttributes extends SVGGraphicsElementAttributes {
  points?: string;
}

export interface SVGRadialGradientElementAttributes extends SVGGlobalAttributes {
  cx?: string | number;
  cy?: string | number;
  r?: string | number;
  fx?: string | number;
  fy?: string | number;
  fr?: string | number;
  gradientUnits?: "userSpaceOnUse" | "objectBoundingBox";
  gradientTransform?: string;
  spreadMethod?: "pad" | "reflect" | "repeat";
  href?: string;
}

export interface SVGRectElementAttributes extends SVGGraphicsElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  rx?: string | number;
  ry?: string | number;
}

export interface SVGSVGElementAttributes extends SVGContainerElementAttributes {
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
  viewBox?: string;
  preserveAspectRatio?: string;
  xmlns?: string;
}

export interface SVGStopElementAttributes extends SVGGlobalAttributes, SVGPresentationAttributes {
  offset?: string | number;
  "stop-color"?: string;
  "stop-opacity"?: string | number;
}

export interface SVGSymbolElementAttributes extends SVGContainerElementAttributes {
  viewBox?: string;
  preserveAspectRatio?: string;
  refX?: string | number;
  refY?: string | number;
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
}

export interface SVGTextElementAttributes extends SVGTextContentElementAttributes {
  rotate?: string | number;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
  textLength?: string | number;
}

export interface SVGTSpanElementAttributes extends SVGTextContentElementAttributes {
  rotate?: string | number;
  lengthAdjust?: "spacing" | "spacingAndGlyphs";
  textLength?: string | number;
}

export interface SVGUseElementAttributes extends SVGGraphicsElementAttributes {
  href?: string;
  x?: string | number;
  y?: string | number;
  width?: string | number;
  height?: string | number;
}

// ==========================================
// 3. Complete SVG Tag to Attribute Set Map
// ==========================================

export interface SVGElementAttributeMap {
  a: SVGAElementAttributes;
  circle: SVGCircleElementAttributes;
  clipPath: SVGClipPathElementAttributes;
  defs: SVGDefsElementAttributes;
  ellipse: SVGEllipseElementAttributes;
  filter: SVGFilterElementAttributes;
  g: SVGGElementAttributes;
  image: SVGImageElementAttributes;
  line: SVGLineElementAttributes;
  linearGradient: SVGLinearGradientElementAttributes;
  mask: SVGMaskElementAttributes;
  path: SVGPathElementAttributes;
  pattern: SVGPatternElementAttributes;
  polygon: SVGPolygonElementAttributes;
  polyline: SVGPolylineElementAttributes;
  radialGradient: SVGRadialGradientElementAttributes;
  rect: SVGRectElementAttributes;
  stop: SVGStopElementAttributes;
  svg: SVGSVGElementAttributes;
  symbol: SVGSymbolElementAttributes;
  text: SVGTextElementAttributes;
  tspan: SVGTSpanElementAttributes;
  use: SVGUseElementAttributes;
}

// Utility Helper for framework typing
export type SVGTag = keyof SVGElementAttributeMap;
export type SVGAttributesFor<T extends SVGTag> = SVGElementAttributeMap[T];
