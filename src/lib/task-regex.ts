/**
 * Shared regex patterns for task parsing and manipulation
 */

// ID patterns - for matching and capturing IDs (no 'g' flag for .match())
export const EMOJI_ID_PATTERN = /🆔\s*([a-zA-Z0-9_-]+)/i;
export const DATAVIEW_BRACKET_ID_PATTERN = /\[id::\s*([a-zA-Z0-9_-]+)\]/i;
export const DATAVIEW_PARENTHESES_ID_PATTERN = /\(id::\s*([a-zA-Z0-9_-]+)\)/i;

// ID patterns for removal/global replacement (with 'g' flag)
export const EMOJI_ID_PATTERN_GLOBAL = /🆔\s*[a-zA-Z0-9_-]+/gi;
export const DATAVIEW_BRACKET_ID_PATTERN_GLOBAL = /\[id::\s*[a-zA-Z0-9_-]+\]/gi;
export const DATAVIEW_PARENTHESES_ID_PATTERN_GLOBAL =
  /\(id::\s*[a-zA-Z0-9_-]+\)/gi;

// Dependency/link patterns - for matching and capturing dependencies
export const CSV_LINKS_PATTERN = /⛔\s*([a-zA-Z0-9_-]+(?:,[a-zA-Z0-9_-]+)*)/g;
export const INDIVIDUAL_LINKS_PATTERN =
  /⛔\s*([a-zA-Z0-9_-]+)(?!,[a-zA-Z0-9_-]+)/g;
export const DATAVIEW_BRACKET_DEPENDS_PATTERN =
  /\[dependsOn::\s*([a-zA-Z0-9_-]+(?:,\s*[a-zA-Z0-9_-]+)*)\]/g;
export const DATAVIEW_PARENTHESES_DEPENDS_PATTERN =
  /\(dependsOn::\s*([a-zA-Z0-9_-]+(?:,\s*[a-zA-Z0-9_-]+)*)\)/g;

// Date field names recognized by the Tasks plugin / Dataview
export const DATE_FIELD_NAMES =
  "due|scheduled|start|created|completion|done|canceled|cancelled";

// Dataview date fields: [due:: 2025-01-01], [[due::2025-01-01]], (due:: 2025-01-01)
export const DATAVIEW_DATE_FIELD_REMOVAL = new RegExp(
  `[[(]{1,2}(?:${DATE_FIELD_NAMES})::\\s*\\d{4}-\\d{2}-\\d{2}[\\])]{1,2}`,
  "gi"
);

// Plain-text date fields: due:2025-01-01, scheduled: 2025-01-01
export const TEXT_DATE_FIELD_REMOVAL = new RegExp(
  `(?:^|\\s)(?:${DATE_FIELD_NAMES}):\\s*\\d{4}-\\d{2}-\\d{2}(?=\\s|$)`,
  "gi"
);

// Progress field names recognized on a task line and in frontmatter.
// The first entry is canonical: it is the only spelling ever written back.
export const PROGRESS_FIELD_NAMES =
  "progress|percentComplete|percent-complete|percentcomplete|percent";

// Dataview progress field: [progress:: 40], [progress:: 40%], (progress:: 40)
// Capturing, for reading the value (no 'g' flag, for .match())
export const PROGRESS_FIELD_PATTERN = new RegExp(
  `[[(]{1,2}(?:${PROGRESS_FIELD_NAMES})::\\s*([^\\])]*)[\\])]{1,2}`,
  "i"
);

// The same field, for stripping it out of a displayed summary and out of a
// line before rewriting it
export const PROGRESS_FIELD_REMOVAL = new RegExp(
  `[[(]{1,2}(?:${PROGRESS_FIELD_NAMES})::\\s*[^\\])]*[\\])]{1,2}`,
  "gi"
);

// A progress value on its own: a number, optionally with a trailing percent
// sign. Deliberately strict — "40 percent" and "nearly done" are not numbers.
export const PROGRESS_VALUE_PATTERN = /^[+-]?\d+(?:\.\d+)?\s*%?$/;

// Cleaning patterns - for removing metadata (no capture groups)
export const EMOJI_ID_REMOVAL = /🆔\s+\S+/g;
export const DATAVIEW_BRACKET_ID_REMOVAL = /\[id::\s*\S+\]/g;
export const DATAVIEW_PARENTHESES_ID_REMOVAL = /\(id::\s*\S+\)/g;
export const TAG_REMOVAL = /#\S+/g;
export const WHITESPACE_NORMALIZE = /\s+/g;

// Tag pattern - for parsing tags
export const TAG_PATTERN = /(?:^|\s)#(\S+)/g;

// Priority pattern - for Obsidian Tasks plugin priority emojis
export const PRIORITY_PATTERN =
  /([\u{1F53A}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}])/u;

// Star pattern - for detecting starred tasks
export const STAR_PATTERN = /⭐/;
export const STAR_PATTERN_GLOBAL = /⭐/g;
