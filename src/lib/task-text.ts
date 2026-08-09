/**
 * Task text for places that cannot render markdown.
 *
 * A task whose text is a wikilink reads as `[[Spec Batteries]]` when shown
 * raw. Timeline bars and tooltips want the words without the brackets; the
 * label column still renders a real, clickable link.
 */

import { PROGRESS_FIELD_REMOVAL } from "./task-regex";

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
