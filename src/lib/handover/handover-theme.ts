/**
 * The one palette the handover pack is drawn in.
 *
 * A handover is read on paper, or as a PDF by somebody who will very likely
 * print it. So none of this follows the vault's theme: the document is fixed,
 * light, and chosen for white stock, exactly as `gantt-export` already is for
 * the chart it draws. The two sit on facing pages of the same document and
 * would look like two documents if they disagreed about ink.
 *
 * These are also the values the print stylesheet uses, which is why they live
 * here rather than inside either drawing — the CSS and the SVG have to name the
 * same grey or the tables stop matching the diagrams.
 */

export const PAPER_INK = "#1f2933";
export const PAPER_MUTED = "#6b7280";
export const PAPER_RULE = "#e4e7ec";
export const PAPER_BAND = "#f6f7f9";
export const PAPER_HEADING_BAND = "#e9ecf1";
export const PAPER_WHITE = "#ffffff";
export const PAPER_ACCENT = "#b4472f";

/** Matches the Gantt export's bars, so a status reads the same in both. */
export const PAPER_STATUS_FILL = {
  todo: "#b7c1d0",
  in_progress: "#3f6fa8",
  done: "#7fa98c",
  canceled: "#dfe2e7",
} as const;

export const PAPER_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, " +
  "Arial, sans-serif";

export const PAPER_MONO_STACK =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

/**
 * Roughly how wide a run of text is, with no DOM to measure it against.
 *
 * The same 0.55em the Gantt export uses, and wrong in the same safe direction:
 * a shade wide, so a label that had room to spare only ever loses a character
 * it did not need.
 */
export function paperTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

/** XML-safe text, for anything dropped into an SVG or an HTML attribute. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** SVG coordinates, rounded: two decimals is under half a device pixel. */
export function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}
