import { App, TFile, normalizePath } from "obsidian";

/**
 * A note per task.
 *
 * A checkbox line has nowhere to put detail, so creating a task can also
 * create a note for it and turn the task's text into a link to that note.
 * The note deliberately does NOT carry a `task` tag: the plugin treats any
 * note tagged `task` as a task in its own right, which would draw a second
 * node for every task that has one.
 */

export const DEFAULT_COMPANION_FOLDER = "Tasks";

export interface CompanionNoteOptions {
  enabled: boolean;
  folder: string;
}

/** Characters Obsidian will not accept in a file name. */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|[\]#^]/g;

/**
 * Turns a task summary into a usable note name: no metadata, no illegal
 * characters, and short enough to stay readable in the file explorer.
 */
export function companionNoteName(summary: string): string {
  const cleaned = summary
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

/**
 * Rewrites a task line so its text points at the companion note, leaving
 * every other piece of metadata where it was.
 */
export function linkifyTaskLine(
  taskLine: string,
  summary: string,
  noteName: string
): string {
  if (!noteName) return taskLine;
  if (taskLine.includes(`[[${noteName}]]`)) return taskLine;

  const trimmedSummary = summary.trim();
  if (trimmedSummary && taskLine.includes(trimmedSummary)) {
    return taskLine.replace(trimmedSummary, `[[${noteName}]]`);
  }

  // The summary is a cleaned-up version of the line, so it does not always
  // appear verbatim; fall back to hanging the link off the end.
  return `${taskLine} [[${noteName}]]`;
}

/** Body of a freshly created companion note. */
export function companionNoteContent(noteName: string): string {
  return `---\ntask-note: true\n---\n\n# ${noteName}\n\n`;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const path = normalizePath(folder);
  if (!path || app.vault.getFolderByPath(path)) return;
  await app.vault.createFolder(path);
}

/**
 * Creates the note for a task, or returns the existing one when a note of
 * that name is already there — reusing beats overwriting someone's notes.
 */
export async function ensureCompanionNote(
  app: App,
  folder: string,
  noteName: string
): Promise<TFile | null> {
  if (!noteName) return null;

  const targetFolder = normalizePath(folder || DEFAULT_COMPANION_FOLDER);
  const path = normalizePath(`${targetFolder}/${noteName}.md`);

  const existing = app.vault.getFileByPath(path);
  if (existing) return existing;

  await ensureFolder(app, targetFolder);

  try {
    return await app.vault.create(path, companionNoteContent(noteName));
  } catch (error) {
    // Most likely a race with another create, or a name the OS rejects
    console.error("Could not create companion note", error);
    return app.vault.getFileByPath(path);
  }
}

/**
 * Creates the companion note for a new task and returns the task line to
 * write, linked to it. Falls back to the original line if anything goes
 * wrong, so a note problem never blocks task creation.
 */
export async function withCompanionNote(
  app: App,
  options: CompanionNoteOptions,
  taskLine: string,
  summary: string
): Promise<string> {
  if (!options.enabled) return taskLine;

  const noteName = companionNoteName(summary);
  if (!noteName) return taskLine;

  const note = await ensureCompanionNote(app, options.folder, noteName);
  if (!note) return taskLine;

  return linkifyTaskLine(taskLine, summary, noteName);
}
