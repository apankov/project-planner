/**
 * Task text for places that cannot render markdown.
 *
 * A task whose text is a wikilink reads as `[[Spec Batteries]]` when shown
 * raw. Timeline bars and tooltips want the words without the brackets; the
 * label column still renders a real, clickable link.
 */

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;
const INLINE_CODE = /`([^`]+)`/g;

/** The words a reader should see: aliases win, paths lose their folders. */
export function plainTaskText(summary: string): string {
  return summary
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
