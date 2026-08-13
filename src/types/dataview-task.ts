import { App, Vault } from "obsidian";
import { BaseTask } from "./base-task";
import { TaskStatus } from "./task";
import { TaskInsertPosition, TaskDateUpdate } from "./base-task";
import {
  TaskDateProperty,
  TaskDateType,
  findTaskDate,
  getTaskDateProperties,
} from "../lib/task-dates";
import {
  TaskNoteChanges,
  companionNoteFor,
  taskNotePatch,
} from "../lib/task-note";
import { writeFrontmatterPatch } from "../lib/frontmatter-write";
import { normalizeOwner, writeOwnerToTaskLine } from "../lib/task-owner";
import {
  findTaskLineByIdOrText,
  statusSymbols,
  addDateToTask,
  removeDateFromTask,
  getTodayDate,
  addSignToTaskInFile,
  removeSignFromTaskInFile,
  parseTaskLine,
} from "../lib/utils";
import {
  EMOJI_ID_REMOVAL,
  DATAVIEW_BRACKET_ID_REMOVAL,
  DATAVIEW_PARENTHESES_ID_REMOVAL,
  TAG_REMOVAL,
  WHITESPACE_NORMALIZE,
} from "../lib/task-regex";
import {
  EMPTY_TASK_FINANCE,
  TaskFinance,
  writeFinanceToTaskLine,
} from "../lib/task-finance";
import {
  TaskProgress,
  clampProgress,
  writeProgressToTaskLine,
} from "../lib/task-progress";
import { normalizeParentId, writeParentToTaskLine } from "../lib/task-parent";

/** Fields `copyWith` can swap on a task without re-reading it from the vault. */
interface DataviewTaskChanges {
  dates?: TaskDateProperty[];
  finance?: TaskFinance;
  progress?: TaskProgress;
  owner?: string | null;
  parentId?: string | null;
}

/**
 * Dataview-style task, whose properties live either on its line or — when the
 * line links to one — in its companion note. See `lib/task-note`.
 */
export class DataviewTask extends BaseTask {
  readonly type = "dataview" as const;

  async updateStatus(newStatus: TaskStatus, app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) return fileContent;

      // TODO: Verify if the escape is really useless here (or change this parsing completely). It was added by the linter, but it seems necessary for correct regex.
      lines[taskLineIdx] = lines[taskLineIdx].replace(
        /\[([ x/\-])\]/, // eslint-disable-line no-useless-escape -- escape required for correct character class behavior
        statusSymbols[newStatus]
      );

      // Add done timestamp
      if (newStatus === "done") {
        lines[taskLineIdx] = addDateToTask(
          lines[taskLineIdx],
          "done",
          getTodayDate()
        );
      }
      // Delete done timestamp, and record when work began — but only for a
      // task that has not already been given a start date. A task planned to
      // start next month has been answered that question already, and the
      // answer is the plan; overwriting it with today would quietly pull the
      // task forward on every chart that draws it.
      else if (newStatus === "in_progress") {
        lines[taskLineIdx] = removeDateFromTask(lines[taskLineIdx], "done");
        const planned = findTaskDate(
          getTaskDateProperties(lines[taskLineIdx]),
          "start"
        );
        if (!planned) {
          lines[taskLineIdx] = addDateToTask(
            lines[taskLineIdx],
            "start",
            getTodayDate()
          );
        }
      }
      // Delete canceled and done timestamp
      else if (newStatus === "todo") {
        lines[taskLineIdx] = removeDateFromTask(lines[taskLineIdx], "canceled");
        lines[taskLineIdx] = removeDateFromTask(lines[taskLineIdx], "done");
        lines[taskLineIdx] = removeDateFromTask(lines[taskLineIdx], "start");
      }

      return lines.join("\n");
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Where a property goes                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Rewrites this task's line and reports the task as the line now reads.
   *
   * Every line-backed setter used to carry its own copy of this: find the
   * line, rewrite it, re-parse, put the ID and the projects back. The only
   * part that ever differed was the rewrite itself, so that is all a caller
   * passes.
   */
  private async rewriteLine(
    app: App,
    // eslint-disable-next-line no-unused-vars -- a callback's parameter name
    rewrite: (line: string) => string
  ): Promise<BaseTask | null> {
    if (!this.link || !this.text) return null;
    const vault = app?.vault;
    if (!vault) return null;
    const file = vault.getFileByPath(this.link);
    if (!file) return null;

    // Held in an object so the assignment inside the callback survives
    // TypeScript's control-flow narrowing
    const written: { line: string | null } = { line: null };

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) return fileContent;

      const line = rewrite(lines[taskLineIdx]);
      lines[taskLineIdx] = line;
      written.line = line;
      return lines.join("\n");
    });

    const updatedLine = written.line;
    if (!updatedLine) return null;

    const updatedTask = parseTaskLine(updatedLine, this.link);
    if (!updatedTask) return null;

    // The line keeps its ID, but re-parsing a line without one would mint a
    // random replacement and orphan the task's dependencies.
    if (!updatedLine.includes(updatedTask.id)) {
      updatedTask.id = this.id;
    }
    updatedTask.projects = this.projects;
    return updatedTask;
  }

  /**
   * Writes one property wherever this task keeps its properties.
   *
   * A task whose line links to a companion note keeps them there, in
   * frontmatter, and the line has the matching field taken *off* — two places
   * holding one fact is two places to disagree, and the note is the one that
   * wins. A task with no note keeps working exactly as it did, with everything
   * on the line.
   *
   * The clean-up of the line is deliberately best-effort. Once the note is
   * written the property is stored; failing the whole call because the line
   * could not also be tidied would report a save that actually happened as a
   * failure, and the views would roll their display back over good data.
   */
  private async writeProperty(
    app: App,
    options: {
      /** What the note should be made to say. */
      note: TaskNoteChanges;
      /** The task as it reads once the write lands. */
      applied: DataviewTaskChanges;
      /** The line carrying the value itself, for a task with no note. */
      // eslint-disable-next-line no-unused-vars -- a callback's parameter name
      write: (line: string) => string;
      /** The line with the field taken off, for a task that has one. */
      // eslint-disable-next-line no-unused-vars -- a callback's parameter name
      clear: (line: string) => string;
    }
  ): Promise<BaseTask | null> {
    const noteFile = companionNoteFor(app, this);
    if (!noteFile) return this.rewriteLine(app, options.write);

    const wrote = await writeFrontmatterPatch(
      app,
      noteFile,
      taskNotePatch(options.note)
    );
    if (!wrote) return null;

    await this.rewriteLine(app, options.clear);

    return this.copyWith(options.applied);
  }

  async setDates(dates: TaskDateUpdate, app: App): Promise<BaseTask | null> {
    const entries = Object.entries(dates).filter(
      ([, date]) => date !== undefined
    ) as Array<[TaskDateType, string | null]>;
    if (entries.length === 0) return null;

    const onLine = (line: string) => {
      let next = line;
      for (const [type, date] of entries) {
        next =
          date === null
            ? removeDateFromTask(next, type)
            : addDateToTask(next, type, date);
      }
      return next;
    };

    return this.writeProperty(app, {
      note: { dates: Object.fromEntries(entries) },
      applied: { dates: this.datesWith(entries) },
      write: onLine,
      // Dates are the one property mirrored rather than cleared. The Tasks
      // plugin reads them off the line, and a schedule the note knows about
      // but Tasks does not is a schedule half the vault cannot see.
      clear: onLine,
    });
  }

  async setFinance(finance: TaskFinance, app: App): Promise<BaseTask | null> {
    return this.writeProperty(app, {
      note: { finance },
      applied: { finance },
      write: (line) => writeFinanceToTaskLine(line, finance),
      clear: (line) => writeFinanceToTaskLine(line, EMPTY_TASK_FINANCE),
    });
  }

  async setProgress(
    progress: number | null,
    app: App
  ): Promise<BaseTask | null> {
    const percent = clampProgress(progress);

    return this.writeProperty(app, {
      note: { progress: { percent } },
      applied: { progress: { percent } },
      write: (line) => writeProgressToTaskLine(line, { percent }),
      clear: (line) => writeProgressToTaskLine(line, { percent: null }),
    });
  }

  async setParent(parentId: string | null, app: App): Promise<BaseTask | null> {
    const id = normalizeParentId(parentId);

    return this.writeProperty(app, {
      note: { parentId: id },
      applied: { parentId: id },
      write: (line) => writeParentToTaskLine(line, id),
      clear: (line) => writeParentToTaskLine(line, null),
    });
  }

  async setOwner(owner: string | null, app: App): Promise<BaseTask | null> {
    const name = normalizeOwner(owner);

    return this.writeProperty(app, {
      note: { owner: name },
      applied: { owner: name },
      write: (line) => writeOwnerToTaskLine(line, name),
      clear: (line) => writeOwnerToTaskLine(line, null),
    });
  }

  /** A copy of this task with a few fields swapped and the rest carried over. */
  private copyWith(changes: DataviewTaskChanges): DataviewTask {
    return new DataviewTask({
      id: this.id,
      summary: this.summary,
      text: this.text,
      tags: this.tags,
      status: this.status,
      priority: this.priority,
      link: this.link,
      incomingLinks: this.incomingLinks,
      starred: this.starred,
      projects: this.projects,
      dates: this.dates,
      finance: this.finance,
      progress: this.progress,
      owner: this.owner,
      parentId: this.parentId,
      ...changes,
    });
  }

  /** This task's dates, with the given types replaced. */
  private datesWith(
    entries: Array<[TaskDateType, string | null]>
  ): TaskDateProperty[] {
    const next = this.dates.filter(
      (entry) => !entries.some(([type]) => type === entry.type)
    );

    for (const [type, date] of entries) {
      if (date !== null) next.push({ type, date });
    }

    return next;
  }

  async addTaskLine(
    newTaskLine: string,
    app: App,
    position: TaskInsertPosition = "after"
  ): Promise<void> {
    if (!this.link) {
      console.log("!task.link: ", newTaskLine);
      return;
    }
    const vault = app?.vault;
    if (!vault) {
      console.log("!vault: ", newTaskLine);
      return;
    }
    const file = vault.getFileByPath(this.link);
    if (!file) {
      console.log("!file: ", newTaskLine);
      return;
    }

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) {
        console.log("taskLineIdx === -1: ", newTaskLine);
        return fileContent;
      }

      const insertIdx =
        position === "before"
          ? taskLineIdx
          : Math.min(taskLineIdx + 1, lines.length);
      lines.splice(insertIdx, 0, newTaskLine);

      return lines.join("\n");
    });
  }

  async delete(app: App): Promise<void> {
    if (!this.link) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) return fileContent;

      // Remove the task line
      lines.splice(taskLineIdx, 1);
      return lines.join("\n");
    });
  }

  async addStar(app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) return fileContent;

      // Add star emoji if not present
      if (!lines[taskLineIdx].includes("⭐")) {
        lines[taskLineIdx] = lines[taskLineIdx] + " ⭐";
      }
      return lines.join("\n");
    });
  }

  async removeStar(app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) return fileContent;

      // Remove star emoji
      lines[taskLineIdx] = lines[taskLineIdx].replace(/\s*⭐\s*/g, " ").trim();
      return lines.join("\n");
    });
  }

  async addTag(tagToAdd: string, app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      let taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) {
        // Fallback: try to find by matching core task text
        const coreTaskText = this.text
          .replace(EMOJI_ID_REMOVAL, "")
          .replace(DATAVIEW_BRACKET_ID_REMOVAL, "")
          .replace(DATAVIEW_PARENTHESES_ID_REMOVAL, "")
          .replace(TAG_REMOVAL, "")
          .replace(WHITESPACE_NORMALIZE, " ")
          .trim();

        taskLineIdx = lines.findIndex((line: string) => {
          const coreLineText = line
            .replace(EMOJI_ID_REMOVAL, "")
            .replace(DATAVIEW_BRACKET_ID_REMOVAL, "")
            .replace(DATAVIEW_PARENTHESES_ID_REMOVAL, "")
            .replace(TAG_REMOVAL, "")
            .replace(WHITESPACE_NORMALIZE, " ")
            .trim();
          return (
            coreLineText.includes(coreTaskText) ||
            coreTaskText.includes(coreLineText)
          );
        });

        if (taskLineIdx === -1) return fileContent;
      }

      const currentLine = lines[taskLineIdx];

      // Check if tag already exists (check for #tag or #tag/subtag)
      const tagPattern = new RegExp(
        `(^|\\s)#${tagToAdd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|\\s|$)`
      );
      if (tagPattern.test(currentLine)) {
        // Tag already exists, don't add it again
        return fileContent;
      }

      // Add the tag at the end
      lines[taskLineIdx] = currentLine + " #" + tagToAdd;

      return lines.join("\n");
    });
  }

  async removeTag(tagToRemove: string, app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);

      let taskLineIdx = findTaskLineByIdOrText(lines, this.id, this.text);

      if (taskLineIdx === -1) {
        // Fallback: try to find by matching core task text
        const coreTaskText = this.text
          .replace(EMOJI_ID_REMOVAL, "")
          .replace(DATAVIEW_BRACKET_ID_REMOVAL, "")
          .replace(DATAVIEW_PARENTHESES_ID_REMOVAL, "")
          .replace(TAG_REMOVAL, "")
          .replace(WHITESPACE_NORMALIZE, " ")
          .trim();

        taskLineIdx = lines.findIndex((line: string) => {
          const coreLineText = line
            .replace(EMOJI_ID_REMOVAL, "")
            .replace(DATAVIEW_BRACKET_ID_REMOVAL, "")
            .replace(DATAVIEW_PARENTHESES_ID_REMOVAL, "")
            .replace(TAG_REMOVAL, "")
            .replace(WHITESPACE_NORMALIZE, " ")
            .trim();
          return (
            coreLineText.includes(coreTaskText) ||
            coreTaskText.includes(coreLineText)
          );
        });

        if (taskLineIdx === -1) return fileContent;
      }

      const currentLine = lines[taskLineIdx];
      const tagPattern = new RegExp(
        `\\s*#${tagToRemove.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/\\S*)?(?=\\s|$)`,
        "g"
      );

      const newLine = currentLine
        .replace(tagPattern, "")
        .replace(/\s+/g, " ")
        .trim();

      lines[taskLineIdx] = newLine;

      return lines.join("\n");
    });
  }

  async addLinkMetadata(
    vault: Vault,
    fromTask: BaseTask,
    linkingStyle: "individual" | "csv" | "dataview" = "individual"
  ): Promise<void> {
    const id = fromTask.id;
    await addSignToTaskInFile(vault, fromTask, "id", id, linkingStyle);
    await addSignToTaskInFile(vault, this, "stop", id, linkingStyle);
  }

  async removeLinkMetadata(vault: Vault, hash: string): Promise<void> {
    await removeSignFromTaskInFile(vault, this, "stop", hash);
  }
}
