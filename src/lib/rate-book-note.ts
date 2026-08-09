import { App, TFile, normalizePath } from "obsidian";
import { EMPTY_RATE_BOOK, RateBook, parseRateBook } from "./rate-book";

/**
 * Getting the rate book out of the vault.
 *
 * The parsing lives in `rate-book`, which has no imports and knows nothing
 * about Obsidian. This is the thin shell around it that finds the note and
 * reads it, kept separate so the parser stays testable.
 */

export const DEFAULT_RATE_NOTE_PATH = "Finance/People and rates.md";

export interface RateBookResult {
  book: RateBook;
  /** False when there is no note at that path yet, so the UI can offer one. */
  found: boolean;
}

/**
 * The path a setting points at. An empty setting falls back to the default,
 * and a path without an extension gets `.md`, so "Finance/Rates" works.
 */
export function resolveRateNotePath(path: string): string {
  const trimmed = (path || "").trim() || DEFAULT_RATE_NOTE_PATH;
  const withExtension = /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;

  return normalizePath(withExtension);
}

/**
 * A starter note. Written only when the user asks for one, and never over the
 * top of a note that is already there.
 */
export function rateNoteTemplate(): string {
  return `# Rates

The chargeout rate for each grade, per hour.

| Grade      | Rate |
| ---------- | ---- |
| Principal  | 145  |
| Senior     | 110  |
| Engineer   | 85   |
| Apprentice | 40   |

# People

Who sits at which grade. Fill in the rate column only to override the
grade's rate for one person.

| Person | Grade    | Rate |
| ------ | -------- | ---- |
|        |          |      |

Tables are found by their column headers, so you can retitle these
headings, reorder the tables, and add notes of your own around them.
`;
}

/** The rate book as the vault currently has it. */
export async function readRateBook(
  app: App,
  path: string
): Promise<RateBookResult> {
  const file = app.vault.getFileByPath(resolveRateNotePath(path));
  if (!file) return { book: EMPTY_RATE_BOOK, found: false };

  try {
    return { book: parseRateBook(await app.vault.read(file)), found: true };
  } catch (error) {
    console.error("Could not read the rate note", error);
    return { book: EMPTY_RATE_BOOK, found: false };
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const folder = path.split("/").slice(0, -1).join("/");
  if (!folder || app.vault.getFolderByPath(folder)) return;

  await app.vault.createFolder(folder);
}

/**
 * Creates the rate note, or hands back the one already there — reusing beats
 * overwriting somebody's rates. Mirrors `ensureCompanionNote`.
 */
export async function ensureRateNote(
  app: App,
  path: string
): Promise<TFile | null> {
  const target = resolveRateNotePath(path);

  const existing = app.vault.getFileByPath(target);
  if (existing) return existing;

  try {
    await ensureFolder(app, target);
    return await app.vault.create(target, rateNoteTemplate());
  } catch (error) {
    // Most likely a race with another create, or a name the OS rejects
    console.error("Could not create the rate note", error);
    return app.vault.getFileByPath(target);
  }
}
