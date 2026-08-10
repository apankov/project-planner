export type TagColorPalette =
  "rainbow" | "ocean" | "forest" | "sunset" | "mono";

export const TAG_COLOR_PALETTES: Record<TagColorPalette, string[]> = {
  rainbow: [
    "#e05c5c", // red
    "#e07c3a", // orange
    "#c9a827", // yellow
    "#4caf62", // green
    "#2674b5", // blue
    "#7c5cbf", // purple
    "#d45fa0", // pink
    "#3ab8b8", // teal
  ],
  ocean: [
    "#1a6e8a",
    "#2187a8",
    "#1f9eb5",
    "#2ab5c4",
    "#3abfaa",
    "#2e9e8c",
    "#1d7e7e",
    "#256e9e",
  ],
  forest: [
    "#2d7a3a",
    "#3a8c45",
    "#4a9e50",
    "#6aaa45",
    "#8ab035",
    "#7a9e2d",
    "#5c8c38",
    "#3d6b2d",
  ],
  sunset: [
    "#c0392b",
    "#d45a2a",
    "#e07030",
    "#e09030",
    "#c97040",
    "#b84060",
    "#a03070",
    "#d04080",
  ],
  mono: [
    "#2674b5",
    "#2674b5",
    "#2674b5",
    "#2674b5",
    "#2674b5",
    "#2674b5",
    "#2674b5",
    "#2674b5",
  ],
};

export const PALETTE_SIZE = 8;

/** Colors a single tag can be pinned to, independent of the active palette. */
export type TagColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "gray";

export const TAG_OVERRIDE_COLORS: Record<TagColorName, string> = {
  red: "#e05c5c",
  orange: "#e07c3a",
  yellow: "#c9a827",
  green: "#4caf62",
  teal: "#3ab8b8",
  blue: "#2674b5",
  indigo: "#4b5bbf",
  purple: "#7c5cbf",
  pink: "#d45fa0",
  gray: "#6e7681",
};

export const TAG_COLOR_NAMES = Object.keys(
  TAG_OVERRIDE_COLORS
) as TagColorName[];

/** Dropdown value meaning "fall back to the palette color". */
export const TAG_COLOR_DEFAULT = "default";

/** Manual color assignments, keyed by tag name (without the leading "#"). */
export type TagColorOverrides = Record<string, TagColorName>;

export function isTagColorName(value: string): value is TagColorName {
  return Object.prototype.hasOwnProperty.call(TAG_OVERRIDE_COLORS, value);
}

/**
 * Returns a copy of `overrides` with `tag` pinned to `color`, or with the
 * override removed when `color` is the default (palette) value.
 */
export function setTagColorOverride(
  overrides: TagColorOverrides,
  tag: string,
  color: TagColorName | typeof TAG_COLOR_DEFAULT
): TagColorOverrides {
  const next = { ...overrides };
  if (color === TAG_COLOR_DEFAULT || !isTagColorName(color)) {
    delete next[tag];
    return next;
  }
  next[tag] = color;
  return next;
}

export function getTagColorClass(
  tag: string,
  palette: TagColorPalette = "rainbow",
  overrides?: TagColorOverrides
): string {
  const override = overrides?.[tag];
  if (override && isTagColorName(override)) {
    return `project-planner-tag--custom-${override}`;
  }

  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) % 2147483647;
  }
  const index = Math.abs(hash) % PALETTE_SIZE;
  return `project-planner-tag--${palette}-${index}`;
}
