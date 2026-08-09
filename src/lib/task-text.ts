/**
 * Task text for places that cannot render markdown, and for rewriting the
 * words on a task line without disturbing the metadata around them.
 *
 * A task whose text is a wikilink reads as `[[Spec Batteries]]` when shown
 * raw. Timeline bars and tooltips want the words without the brackets; the
 * label column still renders a real, clickable link.
 */

import { FINANCE_FIELD_REMOVAL } from "./task-finance";
import {
  PROGRESS_FIELD_REMOVAL,
  TASK_LINE_PREFIX,
  TASK_METADATA_PATTERNS,
} from "./task-regex";

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const INLINE_CODE = /`([^`]+)`/g;

/** The words a reader should see: aliases win, paths lose their folders. */
export function plainTaskText(summary: string): string {
  // Progress goes first, before the wikilink pass: the double-bracket form of
  // the field ([[progress:: 40]]) would otherwise be mistaken for a link and
  // read out as part of the task's name.
  return summary
    .replace(PROGRESS_FIELD_REMOVAL, "")
    .replace(WIKILINK, (_match, target: string, alias?: string) => {
      if (alias) return alias;
      // "Notes/Spec Batteries" reads better as just the note name
      return target.split("/").pop() ?? target;
    })
    .replace(MARKDOWN_LINK, "$1")
    .replace(INLINE_CODE, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Rewriting the words on a task line                                         */
/* -------------------------------------------------------------------------- */

/** Every pattern that marks part of a task line as metadata, not description. */
const METADATA_PATTERNS = [...TASK_METADATA_PATTERNS, FINANCE_FIELD_REMOVAL];

interface Span {
  start: number;
  end: number;
}

/**
 * The stretches of a task's text that are metadata, merged and in order.
 *
 * Patterns overlap by design — `⛔ a,b` matches both the CSV and the single-ID
 * dependency pattern — so the spans are merged rather than taken one pattern
 * at a time. Touching spans merge too, which is what keeps `#one #two` from
 * being pulled apart and rejoined with a lost space.
 */
function metadataSpans(text: string): Span[] {
  const spans: Span[] = [];

  for (const pattern of METADATA_PATTERNS) {
    // `matchAll` works on a copy, so these shared patterns keep no state
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || match[0].length === 0) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  spans.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
      continue;
    }
    merged.push({ ...span });
  }

  return merged;
}

/**
 * The words on a task line, with every field the plugin understands taken off.
 *
 * This is what an editor should show and what a rename replaces. It is close
 * to a task's `summary` but not the same thing: `summary` also strips emoji
 * and wiki-link syntax for display, and neither of those is metadata — a 🎉 or
 * a `[[link]]` a person typed is part of what they wrote.
 */
export function taskTextDescription(text: string): string {
  const spans = metadataSpans(text);

  let description = "";
  let cursor = 0;
  for (const span of spans) {
    description += text.slice(cursor, span.start) + " ";
    cursor = span.end;
  }
  description += text.slice(cursor);

  return description.replace(/\s{2,}/g, " ").trim();
}

/**
 * A task line with its words replaced and everything else kept.
 *
 * The metadata is re-emitted in the order it was found, after the new words.
 * Fields written between words therefore move to the end — the alternative is
 * guessing which gap in the new text each one belonged in, which cannot be
 * done and would be worse when it guessed wrong. Nothing is dropped, and a
 * line that is not a task line comes back untouched.
 */
export function writeTextToTaskLine(
  taskLine: string,
  description: string
): string {
  const match = taskLine.match(TASK_LINE_PREFIX);
  if (!match) return taskLine;

  const [, prefix, text] = match;
  const metadata = metadataSpans(text)
    .map((span) => text.slice(span.start, span.end).trim())
    .filter((piece) => piece.length > 0);

  const words = description.replace(/\s{2,}/g, " ").trim();
  // Trimmed on the right only: the prefix's leading whitespace is how a nested
  // list item knows it is nested
  const head = `${prefix}${words}`.replace(/\s+$/, "");

  return metadata.length > 0 ? `${head} ${metadata.join(" ")}` : head;
}
