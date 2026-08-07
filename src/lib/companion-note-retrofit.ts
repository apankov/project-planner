import { App } from "obsidian";
import { BaseTask } from "src/types/base-task";
import {
  CompanionNoteOptions,
  companionNoteName,
  ensureCompanionNote,
  linkifyTaskLine,
} from "./companion-note";
import { findTaskLineByIdOrText } from "./utils";

/**
 * Giving existing tasks a note each.
 *
 * New tasks get a companion note as they are created, which leaves every task
 * written before that without one. This walks the tasks already in the vault
 * and does the same job in bulk: create the note, then rewrite the task's text
 * as a link to it.
 */

export interface RetrofitResult {
  linked: number;
  skipped: number;
  failed: number;
}

/** True when the task's text already points at a note. */
export function taskAlreadyLinked(task: BaseTask): boolean {
  return /\[\[[^\]]+\]\]/.test(task.summary);
}

/**
 * Tasks a retrofit would touch: inline tasks with a usable name that are not
 * already links. Note-based tasks are skipped — they *are* their note.
 */
export function findTasksNeedingNotes(tasks: BaseTask[]): BaseTask[] {
  return tasks.filter((task) => {
    if (task.type !== "dataview") return false;
    if (!task.link) return false;
    if (taskAlreadyLinked(task)) return false;
    return companionNoteName(task.summary).length > 0;
  });
}

/**
 * Creates the note for one task and rewrites its line to link to it.
 * Returns false when the task's line could no longer be found.
 */
export async function linkTaskToNote(
  app: App,
  task: BaseTask,
  options: CompanionNoteOptions
): Promise<boolean> {
  const noteName = companionNoteName(task.summary);
  if (!noteName) return false;

  const file = app.vault.getFileByPath(task.link);
  if (!file) return false;

  const note = await ensureCompanionNote(app, options.folder, noteName);
  if (!note) return false;

  const written = { done: false };

  await app.vault.process(file, (content) => {
    const lines = content.split(/\r?\n/);
    const index = findTaskLineByIdOrText(lines, task.id, task.text);
    if (index === -1) return content;

    const updated = linkifyTaskLine(lines[index], task.summary, noteName);
    if (updated === lines[index]) return content;

    lines[index] = updated;
    written.done = true;
    return lines.join("\n");
  });

  return written.done;
}

/**
 * Retrofits every task that needs a note, one at a time so a single bad line
 * cannot abandon the rest of the run.
 */
export async function retrofitCompanionNotes(
  app: App,
  tasks: BaseTask[],
  options: CompanionNoteOptions
): Promise<RetrofitResult> {
  const targets = findTasksNeedingNotes(tasks);
  const result: RetrofitResult = { linked: 0, skipped: 0, failed: 0 };

  for (const task of targets) {
    try {
      const ok = await linkTaskToNote(app, task, options);
      if (ok) {
        result.linked += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      console.error("Could not give a task its note", task.id, error);
      result.failed += 1;
    }
  }

  return result;
}
