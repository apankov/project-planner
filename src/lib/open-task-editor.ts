/**
 * Opening the task editor, from wherever the user clicked.
 *
 * Every view used to do this for itself, and they had drifted: the timeline and
 * the board offered four fields and a separate dialog for costing, and the map
 * handed the task line to the Tasks plugin, whose modal had to have the fields
 * it does not understand stripped off and stitched back on around it. What a
 * task *was* therefore depended on where you double-clicked.
 *
 * This is that sequence, once — open, diff, write, redraw, undo. What stays
 * with each view is the part that is genuinely theirs: how a row redraws.
 */

import { App, Notice } from "obsidian";
import { BaseTask } from "src/types/base-task";
import { ProjectPlannerSettings } from "src/types/settings";
import { UndoHistory } from "./undo-history";
import { RateBook } from "./rate-book";
import { readRateBook } from "./rate-book-note";
import { TaskEditDraft, draftChanged, draftFromTask } from "./task-edit-draft";
import { TaskEditContext, applyTaskEdit, withTaskChanges } from "./task-write";
import { datesFromDraft } from "./task-write";
import { companionNoteFor } from "./task-note";
import { linkTaskToNote } from "./companion-note-retrofit";
import { collectDescendantIds } from "./task-hierarchy";
import { plainTaskText } from "./task-text";
import { addSignToTaskInFile } from "./utils";
import { TaskChoice } from "src/components/task-edit-form";
import { promptForTaskEdit } from "src/components/task-edit-modal";
import { t } from "../i18n";

export interface OpenTaskEditorOptions {
  app: App;
  task: BaseTask;
  /** Every task, for the pickers and for resolving a dependency to its task. */
  tasks: BaseTask[];
  settings: ProjectPlannerSettings;
  undoHistory: UndoHistory;
  /**
   * The chart's dates for a bar it had to infer. They fill the empty date
   * fields, so accepting the schedule the chart proposed is a click and a save.
   */
  suggested?: { start: string; due: string } | null;
  /** True for a parent row, whose span is its children's and not its own. */
  summary?: boolean;
  /** Draws the task as it now reads: optimistically, then again for real. */
  // eslint-disable-next-line no-unused-vars -- a callback's parameter name
  onTaskUpdated: (task: BaseTask) => void;
}

/**
 * The tasks a task may be nested under or made to wait on.
 *
 * Itself and its own descendants are left out: a task cannot be its own parent
 * and cannot be put inside something that is already inside it, and offering
 * either would only be offering a loop.
 */
export function editorChoices(task: BaseTask, tasks: BaseTask[]): TaskChoice[] {
  const parentById = new Map(
    tasks.map((candidate) => [candidate.id, candidate.parentId])
  );
  const forbidden = collectDescendantIds(parentById, task.id);
  forbidden.add(task.id);

  return tasks
    .filter((candidate) => !forbidden.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      label: plainTaskText(candidate.summary),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Every tag in use, most-used first, for the tag picker. */
export function knownTags(tasks: BaseTask[]): string[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const tag of task.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

/**
 * Writes the ID into an inline task's line before anything else is written.
 *
 * A task with no ID is found again by its text, which is ambiguous when two
 * tasks read the same — and, in an editor that can rename, about to change.
 */
async function stampTaskId(
  app: App,
  task: BaseTask,
  settings: ProjectPlannerSettings
): Promise<void> {
  if (task.type !== "dataview") return;
  await addSignToTaskInFile(
    app.vault,
    task,
    "id",
    task.id,
    settings.linkingStyle
  );
}

/** The task as the dialog's draft would leave it, for the optimistic redraw. */
function optimistic(task: BaseTask, draft: TaskEditDraft): BaseTask {
  return withTaskChanges(task, {
    status: draft.status,
    progress: { percent: draft.progress },
    dates: datesFromDraft(task.dates, draft),
    tags: [...draft.tags],
    incomingLinks: [...draft.dependsOn],
    ...(task.type === "dataview" ? { summary: draft.text } : {}),
  });
}

/**
 * Writes one edit and reports whether it landed.
 *
 * The redraw is optimistic and the vault write is what can fail; a failure puts
 * the task the view was showing back and says so. What the write returns is
 * read back off the note, so the view ends up showing what the file says rather
 * than what the dialog hoped.
 */
async function writeEdit(
  options: OpenTaskEditorOptions,
  task: BaseTask,
  draft: TaskEditDraft,
  previous: TaskEditDraft
): Promise<boolean> {
  const { app, settings, onTaskUpdated } = options;

  if (!draftChanged(draft, previous)) return true;

  onTaskUpdated(optimistic(task, draft));

  const context: TaskEditContext = {
    linkingStyle: settings.linkingStyle,
    taskById: (id) => options.tasks.find((candidate) => candidate.id === id),
  };

  try {
    await stampTaskId(app, task, settings);
    onTaskUpdated(await applyTaskEdit(app, task, draft, previous, context));
    return true;
  } catch (error) {
    console.error("Could not save the task edit", error);
    new Notice(
      t("task_edit.write_failed", { task: plainTaskText(task.summary) })
    );
    onTaskUpdated(task);
    return false;
  }
}

/**
 * Opens the editor for a task and writes back whatever comes out of it.
 *
 * Returns true when something was saved, so a caller that wants to reload can.
 */
export async function openTaskEditor(
  options: OpenTaskEditorOptions
): Promise<boolean> {
  const { app, task, settings, undoHistory } = options;

  const book: RateBook = settings.financeEnabled
    ? (await readRateBook(app, settings.financeRateNotePath)).book
    : { grades: [], people: [], problems: [] };

  const noteFile = companionNoteFor(app, task);
  const previous = draftFromTask(task);

  const result = await promptForTaskEdit(app, {
    initial: previous,
    canEditText: task.type === "dataview",
    summary: options.summary ?? false,
    suggested: options.suggested ?? null,
    noteName: noteFile?.basename ?? null,
    noteFile,
    financeEnabled: settings.financeEnabled,
    currency: settings.financeCurrency,
    cost: {
      book,
      defaultHoursPerDay: settings.financeDefaultHoursPerDay,
      skipWeekends: settings.ganttSkipWeekends,
    },
    choices: editorChoices(task, options.tasks),
    allTags: knownTags(options.tasks),
    onCreateNote:
      noteFile || task.type !== "dataview"
        ? null
        : () => void createNoteFor(options),
  });

  if (!result) return false;

  const saved = await writeEdit(options, task, result.draft, previous);
  if (!saved) return false;

  undoHistory.push({
    label: t("task_edit.undo_edit", { task: plainTaskText(task.summary) }),
    // The same write, run backwards. It looks the task up afresh, so an undo
    // long after the fact still finds the line where it is now.
    undo: async () => {
      const current =
        options.tasks.find((candidate) => candidate.id === task.id) ?? task;
      await writeEdit(options, current, previous, result.draft);
    },
  });

  return true;
}

/** Gives a task a note, and points its line at it. */
async function createNoteFor(options: OpenTaskEditorOptions): Promise<void> {
  const { app, task, settings } = options;

  try {
    const linked = await linkTaskToNote(app, task, {
      enabled: true,
      folder: settings.companionNoteFolder,
    });
    if (!linked) {
      new Notice(t("task_edit.note_failed"));
      return;
    }
    new Notice(t("task_edit.note_created"));
  } catch (error) {
    console.error("Could not give the task a note", error);
    new Notice(t("task_edit.note_failed"));
  }
}
