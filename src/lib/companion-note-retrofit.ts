import { App, TFile } from "obsidian";
import { BaseTask } from "src/types/base-task";
import {
  CompanionNoteOptions,
  companionNoteName,
  ensureCompanionNote,
  linkifyTaskLine,
} from "./companion-note";
import { TaskNoteChanges, companionNoteFor, taskNotePatch } from "./task-note";
import { writeFrontmatterPatch } from "./frontmatter-write";
import { findTaskDate } from "./task-dates";
import {
  EMPTY_TASK_FINANCE,
  hasFinanceData,
  writeFinanceToTaskLine,
} from "./task-finance";
import { writeProgressToTaskLine } from "./task-progress";
import { writeParentToTaskLine } from "./task-parent";
import { writeOwnerToTaskLine } from "./task-owner";
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
  /** Tasks whose properties were moved off the line into their note. */
  migrated: number;
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
 *
 * Returns the note, so a caller that wants to move the task's properties into
 * it can do so straight away. Resolving the link again instead would mean
 * asking the metadata cache about a file written a moment ago, which it has not
 * necessarily caught up with yet.
 *
 * Null when the note could not be made, or when the task's line could no longer
 * be found to point at it.
 */
export async function linkTaskToNote(
  app: App,
  task: BaseTask,
  options: CompanionNoteOptions
): Promise<TFile | null> {
  const noteName = companionNoteName(task.summary);
  if (!noteName) return null;

  const file = app.vault.getFileByPath(task.link);
  if (!file) return null;

  const note = await ensureCompanionNote(app, options.folder, noteName);
  if (!note) return null;

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

  return written.done ? note : null;
}

/**
 * Moves a task's properties off its line and into the note it now links to.
 *
 * The second half of giving a task a note: the link alone leaves an empty note
 * beside a line still carrying everything, which is the arrangement this whole
 * change exists to undo. Dates stay on the line as well as going into the note,
 * for the same reason `setDates` mirrors them — the Tasks plugin reads them
 * there.
 *
 * Idempotent, and safe on a task that has nothing to move: a task whose line
 * carries no properties writes an empty patch and reports false.
 */
export async function migrateTaskPropertiesToNote(
  app: App,
  task: BaseTask,
  /** The note, when the caller has just made it and the cache may not know. */
  target?: TFile | null
): Promise<boolean> {
  const note = target ?? companionNoteFor(app, task);
  if (!note) return false;

  const changes: TaskNoteChanges = {};
  let anything = false;

  const start = findTaskDate(task.dates, "start");
  const due = findTaskDate(task.dates, "due");
  if (start || due) {
    changes.dates = {};
    if (start) changes.dates.start = start;
    if (due) changes.dates.due = due;
    anything = true;
  }

  if (hasFinanceData(task.finance)) {
    changes.finance = task.finance;
    anything = true;
  }
  if (task.progress.percent !== null) {
    changes.progress = task.progress;
    anything = true;
  }
  if (task.owner !== null) {
    changes.owner = task.owner;
    anything = true;
  }
  if (task.parentId !== null) {
    changes.parentId = task.parentId;
    anything = true;
  }
  if (task.tags.length > 0) {
    changes.tags = task.tags;
    anything = true;
  }

  if (!anything) return false;

  const wrote = await writeFrontmatterPatch(app, note, taskNotePatch(changes));
  if (!wrote) return false;

  // The line keeps its checkbox, its link, its id and its dates; everything the
  // note now holds comes off it, so the two cannot end up disagreeing
  await stripMigratedFieldsFromLine(app, task);
  return true;
}

/** Takes off the line every field the note has just taken over. */
async function stripMigratedFieldsFromLine(
  app: App,
  task: BaseTask
): Promise<void> {
  const file = app.vault.getFileByPath(task.link);
  if (!file) return;

  await app.vault.process(file, (content) => {
    const lines = content.split(/\r?\n/);
    const index = findTaskLineByIdOrText(lines, task.id, task.text);
    if (index === -1) return content;

    let line = lines[index];
    line = writeFinanceToTaskLine(line, EMPTY_TASK_FINANCE);
    line = writeProgressToTaskLine(line, { percent: null });
    line = writeParentToTaskLine(line, null);
    line = writeOwnerToTaskLine(line, null);

    if (line === lines[index]) return content;

    lines[index] = line;
    return lines.join("\n");
  });
}

/**
 * Retrofits every task that needs a note, one at a time so a single bad line
 * cannot abandon the rest of the run.
 *
 * Two jobs: tasks with no note get one and are linked to it, and every task
 * that has a note has its properties moved into it. The second pass covers
 * tasks linked by an earlier run of this command, back when the note was only
 * somewhere to write prose.
 */
export async function retrofitCompanionNotes(
  app: App,
  tasks: BaseTask[],
  options: CompanionNoteOptions
): Promise<RetrofitResult> {
  const result: RetrofitResult = {
    linked: 0,
    skipped: 0,
    failed: 0,
    migrated: 0,
  };

  const needNotes = new Set(findTasksNeedingNotes(tasks));

  for (const task of tasks) {
    if (task.type !== "dataview") continue;

    try {
      // A task that already links to its note is not re-linked, but its
      // properties still move: an earlier run of this command left the note
      // empty, back when it was only somewhere to write prose.
      let note: TFile | null = null;

      if (needNotes.has(task)) {
        note = await linkTaskToNote(app, task, options);
        if (note) {
          result.linked += 1;
        } else {
          result.skipped += 1;
          continue;
        }
      }

      if (await migrateTaskPropertiesToNote(app, task, note)) {
        result.migrated += 1;
      }
    } catch (error) {
      console.error("Could not give a task its note", task.id, error);
      result.failed += 1;
    }
  }

  return result;
}
