/**
 * Per-connection styling for the map.
 *
 * A line between two tasks can mean different things — blocked by, informs,
 * nice-to-have — so each one can carry its own colour, dash pattern and
 * arrowheads. Styles are stored against the pair of task IDs rather than the
 * ReactFlow edge id, which is regenerated (and differs between a freshly
 * drawn edge and the same edge after a reload).
 */

export type EdgeColorName =
  "default" | "red" | "orange" | "green" | "blue" | "purple" | "grey";

export type EdgeLinePattern = "solid" | "dashed" | "dotted";

/** Which ends of the line carry an arrowhead. */
export type EdgeArrows = "end" | "start" | "both" | "none";

export interface EdgeStyleOverride {
  color: EdgeColorName;
  pattern: EdgeLinePattern;
  arrows: EdgeArrows;
}

export type EdgeStyleOverrides = Record<string, EdgeStyleOverride>;

export const EDGE_COLOR_NAMES: EdgeColorName[] = [
  "default",
  "red",
  "orange",
  "green",
  "blue",
  "purple",
  "grey",
];

export const EDGE_LINE_PATTERNS: EdgeLinePattern[] = [
  "solid",
  "dashed",
  "dotted",
];

export const EDGE_ARROW_OPTIONS: EdgeArrows[] = [
  "end",
  "start",
  "both",
  "none",
];

export const DEFAULT_EDGE_STYLE: EdgeStyleOverride = {
  color: "default",
  pattern: "solid",
  arrows: "end",
};

/** Keys a style to the two tasks it joins, blocker first. */
export function edgeStyleKey(sourceId: string, targetId: string): string {
  return `${sourceId}->${targetId}`;
}

export function isDefaultEdgeStyle(style: EdgeStyleOverride): boolean {
  return (
    style.color === DEFAULT_EDGE_STYLE.color &&
    style.pattern === DEFAULT_EDGE_STYLE.pattern &&
    style.arrows === DEFAULT_EDGE_STYLE.arrows
  );
}

export function getEdgeStyle(
  overrides: EdgeStyleOverrides | undefined,
  sourceId: string,
  targetId: string
): EdgeStyleOverride {
  return overrides?.[edgeStyleKey(sourceId, targetId)] ?? DEFAULT_EDGE_STYLE;
}

/**
 * Returns a copy of `overrides` with this connection restyled, dropping the
 * entry entirely when the style is back to the default so the settings file
 * does not fill up with no-ops.
 */
export function setEdgeStyleOverride(
  overrides: EdgeStyleOverrides,
  sourceId: string,
  targetId: string,
  style: EdgeStyleOverride
): EdgeStyleOverrides {
  const next = { ...overrides };
  const key = edgeStyleKey(sourceId, targetId);

  if (isDefaultEdgeStyle(style)) {
    delete next[key];
    return next;
  }

  next[key] = style;
  return next;
}

export function clearEdgeStyleOverride(
  overrides: EdgeStyleOverrides,
  sourceId: string,
  targetId: string
): EdgeStyleOverrides {
  const next = { ...overrides };
  delete next[edgeStyleKey(sourceId, targetId)];
  return next;
}

/** Classes for the rendered path. Colour and dash are pure CSS. */
export function getEdgeStyleClasses(style: EdgeStyleOverride): string[] {
  const classes: string[] = [];
  if (style.color !== "default") {
    classes.push(`tasks-map-hash-edge-path--color-${style.color}`);
  }
  if (style.pattern !== "solid") {
    classes.push(`tasks-map-hash-edge-path--${style.pattern}`);
  }
  return classes;
}

export function showsArrowAtStart(style: EdgeStyleOverride): boolean {
  return style.arrows === "start" || style.arrows === "both";
}

export function showsArrowAtEnd(style: EdgeStyleOverride): boolean {
  return style.arrows === "end" || style.arrows === "both";
}

/**
 * Marker id for a colour. Markers cannot inherit the path's stroke, so there
 * is one per colour, defined once per view.
 */
export function edgeMarkerId(color: EdgeColorName): string {
  return `tasks-map-edge-arrow-${color}`;
}
