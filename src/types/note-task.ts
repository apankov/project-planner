import { App, Vault, parseYaml, stringifyYaml } from "obsidian";
import { BaseTask } from "./base-task";
import { TaskStatus } from "./task";
import { TaskInsertPosition, TaskDateUpdate } from "./base-task";
import {
  TaskDateProperty,
  TaskDateType,
  frontmatterKeyForDate,
} from "../lib/task-dates";
import { TaskFinance, financeFrontmatterPatch } from "../lib/task-finance";
import {
  TaskProgress,
  clampProgress,
  progressFrontmatterPatch,
} from "../lib/task-progress";
import { normalizeParentId, parentFrontmatterPatch } from "../lib/task-parent";
import { normalizeOwner, ownerFrontmatterPatch } from "../lib/task-owner";
import { findFrontmatter, updateFrontmatter } from "../lib/frontmatter-write";

interface DependencyEntry {
  uid: string;
  reltype: string;
}

/** Strips the checkbox, tags and emoji metadata off a task line. */
function summariseTaskLine(taskLine: string): string {
  return taskLine
    .replace(/^\s*[-*+]\s+\[[ x/-]\]\s*/, "")
    .replace(/(?:^|\s)#\S+/g, "")
    .replace(/[\p{Extended_Pictographic}]+\s*\S*/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toSafeFileName(title: string): string {
  return title
    .replace(/[\\/:*?"<>|[\]#^]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Note-based task that stores metadata in frontmatter
 */
export class NoteTask extends BaseTask {
  readonly type = "note" as const;

  async updateStatus(newStatus: TaskStatus, app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);

      // Find frontmatter boundaries
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Map TaskStatus to note-based status format
      const noteStatus =
        newStatus === "todo"
          ? "open"
          : newStatus === "done"
            ? "done"
            : newStatus === "in_progress"
              ? "in-progress"
              : newStatus === "canceled"
                ? "canceled"
                : "open";

      // Find and update status line
      for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
        if (lines[i].startsWith("status:")) {
          lines[i] = `status: ${noteStatus}`;
          break;
        }
      }

      return lines.join("\n");
    });
  }

  async addTaskLine(
    newTaskLine: string,
    app: App,
    // _position is intentionally unused: NoteTask always creates a new file
    // regardless of where relative to the anchor the task should appear.
    _position: TaskInsertPosition = "after"
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
    const originalFile = vault.getFileByPath(this.link);
    if (!originalFile) {
      console.log("!originalFile: ", newTaskLine);
      return;
    }

    const folderPath = originalFile.parent?.path;
    if (!folderPath) {
      console.log("!folderPath: ", newTaskLine);
      return;
    }

    // The note's title is the new task's text, and the frontmatter is what
    // makes the plugin see it as a task at all. This previously wrote a
    // timestamp-named file containing the *anchor's* text with no
    // frontmatter, which the task reader then skipped forever.
    const title = summariseTaskLine(newTaskLine) || this.text;
    const fileName = toSafeFileName(title) || `Task-${Date.now()}`;
    const newFilePath = `${folderPath}/${fileName}.md`;

    if (vault.getFileByPath(newFilePath)) {
      console.warn(`A note already exists at ${newFilePath}`);
      return;
    }

    await vault.create(
      newFilePath,
      `---\ntags:\n  - task\nstatus: open\n---\n\n# ${title}\n\n`
    );
  }

  /**
   * Reads the note's frontmatter, hands it to `mutate`, and writes back what
   * that leaves behind. Returns false when there was nothing to write to.
   *
   * The work itself lives in `lib/frontmatter-write` now, because an inline
   * task's companion note is written the same way and two implementations of
   * this would be two different ways for a save to go wrong.
   */
  private async updateFrontmatter(
    app: App,
    mutate: (_frontmatter: Record<string, unknown>) => void
  ): Promise<boolean> {
    if (!this.link) return false;
    const file = app?.vault?.getFileByPath(this.link);
    if (!file) return false;

    return updateFrontmatter(app, file, mutate);
  }

  async setDates(dates: TaskDateUpdate, app: App): Promise<BaseTask | null> {
    const entries = Object.entries(dates).filter(
      ([, date]) => date !== undefined
    ) as Array<[TaskDateType, string | null]>;
    if (entries.length === 0) return null;

    const wrote = await this.updateFrontmatter(app, (frontmatter) => {
      for (const [type, date] of entries) {
        const key = frontmatterKeyForDate(type);
        if (date === null) {
          delete frontmatter[key];
        } else {
          frontmatter[key] = date;
        }
      }
    });

    if (!wrote) return null;

    return this.withDates(entries);
  }

  async setFinance(finance: TaskFinance, app: App): Promise<BaseTask | null> {
    const { set, remove } = financeFrontmatterPatch(finance);

    const wrote = await this.updateFrontmatter(app, (frontmatter) => {
      // Every accepted spelling goes, so switching from `estimatedHours` to
      // `hours` cannot leave the old key behind contradicting the new one
      for (const key of remove) delete frontmatter[key];
      Object.assign(frontmatter, set);
    });

    if (!wrote) return null;

    return this.copyWith({ finance });
  }

  async setProgress(
    progress: number | null,
    app: App
  ): Promise<BaseTask | null> {
    const percent = clampProgress(progress);
    const { set, remove } = progressFrontmatterPatch({ percent });

    const wrote = await this.updateFrontmatter(app, (frontmatter) => {
      // Every accepted spelling goes, so a note that used `percent` cannot
      // keep it around contradicting the `progress` just written
      for (const key of remove) delete frontmatter[key];
      Object.assign(frontmatter, set);
    });

    if (!wrote) return null;

    return this.copyWith({ progress: { percent } });
  }

  async setOwner(owner: string | null, app: App): Promise<BaseTask | null> {
    const name = normalizeOwner(owner);
    const { set, remove } = ownerFrontmatterPatch(name);

    const wrote = await this.updateFrontmatter(app, (frontmatter) => {
      // Every accepted spelling goes, so a note that used `assignee` cannot
      // keep it around contradicting the `owner` just written
      for (const key of remove) delete frontmatter[key];
      Object.assign(frontmatter, set);
    });

    if (!wrote) return null;

    return this.copyWith({ owner: name });
  }

  async setParent(parentId: string | null, app: App): Promise<BaseTask | null> {
    const id = normalizeParentId(parentId);
    const { set, remove } = parentFrontmatterPatch(id);

    const wrote = await this.updateFrontmatter(app, (frontmatter) => {
      // Every accepted spelling goes, so a note that used `parentId` cannot
      // keep it around contradicting the `parent` just written
      for (const key of remove) delete frontmatter[key];
      Object.assign(frontmatter, set);
    });

    if (!wrote) return null;

    return this.copyWith({ parentId: id });
  }

  /** A copy of this task with a few fields swapped and the rest carried over. */
  private copyWith(changes: {
    dates?: TaskDateProperty[];
    finance?: TaskFinance;
    progress?: TaskProgress;
    owner?: string | null;
    parentId?: string | null;
  }): NoteTask {
    return new NoteTask({
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

  /** A copy of this task carrying the updated dates. */
  private withDates(entries: Array<[TaskDateType, string | null]>): NoteTask {
    const nextDates: TaskDateProperty[] = this.dates.filter(
      (entry) => !entries.some(([type]) => type === entry.type)
    );

    for (const [type, date] of entries) {
      if (date !== null) nextDates.push({ type, date });
    }

    return this.copyWith({ dates: nextDates });
  }

  async delete(app: App): Promise<void> {
    if (!this.link) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await app.fileManager.trashFile(file);
  }

  async addStar(app: App): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Find and update starred field, or add it if not present
      let starredLineFound = false;
      for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
        if (lines[i].match(/^starred:\s*/)) {
          lines[i] = "starred: true";
          starredLineFound = true;
          break;
        }
      }

      if (!starredLineFound) {
        lines.splice(frontmatterEnd, 0, "starred: true");
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
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Find and update starred field
      for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
        if (lines[i].match(/^starred:\s*/)) {
          lines[i] = "starred: false";
          break;
        }
      }

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
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Find tags section
      let i = frontmatterStart + 1;
      let tagsLineIdx = -1;
      while (i < frontmatterEnd) {
        if (lines[i] === "tags:") {
          tagsLineIdx = i;
          break;
        }
        i++;
      }

      // If tags section doesn't exist, add it
      if (tagsLineIdx === -1) {
        lines.splice(frontmatterEnd, 0, "tags:", `  - ${tagToAdd}`);
        return lines.join("\n");
      }

      // Check if tag already exists
      i = tagsLineIdx + 1;
      while (i < frontmatterEnd && lines[i].match(/^\s{2}- /)) {
        const tagMatch = lines[i].match(/^\s{2}- (.+)$/);
        if (tagMatch && tagMatch[1] === tagToAdd) {
          // Tag already exists
          return fileContent;
        }
        i++;
      }

      // Add the tag
      lines.splice(i, 0, `  - ${tagToAdd}`);

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
      let { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Find and remove the tag from the tags array
      let i = frontmatterStart + 1;
      while (i < frontmatterEnd) {
        const line = lines[i];
        if (line === "tags:") {
          // Found tags section, look for the tag in the following lines
          i++;
          while (i < frontmatterEnd && lines[i].match(/^\s{2}- /)) {
            const tagLine = lines[i];
            const tagMatch = tagLine.match(/^\s{2}- (.+)$/);
            if (tagMatch && tagMatch[1] === tagToRemove) {
              // Found the tag, remove it
              lines.splice(i, 1);
              break;
            }
            i++;
          }
          break;
        }
        i++;
      }

      return lines.join("\n");
    });
  }

  async addProject(app: App, projectName: string): Promise<void> {
    if (!this.link || !this.text) return;
    const vault = app?.vault;
    if (!vault) return;
    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Find projects section
      let i = frontmatterStart + 1;
      let projectsLineIdx = -1;
      while (i < frontmatterEnd) {
        if (lines[i] === "projects:") {
          projectsLineIdx = i;
          break;
        }
        i++;
      }

      // If projects section doesn't exist, add it
      if (projectsLineIdx === -1) {
        lines.splice(
          frontmatterEnd,
          0,
          "projects:",
          `  - "[[${projectName}]]"`
        );
        return lines.join("\n");
      }

      // Check if project already exists
      i = projectsLineIdx + 1;
      while (i < frontmatterEnd && lines[i].match(/^\s{2}- /)) {
        const entryMatch = lines[i].match(/^\s{2}- (.+)$/);
        if (entryMatch) {
          const raw = entryMatch[1].replace(/^"|"$/g, "");
          const wikiMatch = raw.match(/^\[\[(.+)\]\]$/);
          const existing = wikiMatch ? wikiMatch[1] : raw;
          if (existing === projectName) {
            return fileContent;
          }
        }
        i++;
      }

      // Append project entry
      lines.splice(i, 0, `  - "[[${projectName}]]"`);
      return lines.join("\n");
    });
  }

  async addLinkMetadata(vault: Vault, fromTask: BaseTask): Promise<void> {
    await this.addDependencyToFrontmatter(vault, fromTask);
  }

  async removeLinkMetadata(vault: Vault, fromTaskId: string): Promise<void> {
    await this.removeDependencyFromFrontmatter(vault, fromTaskId);
  }

  /**
   * Helper method to find frontmatter boundaries. Shared with the companion
   * note writer, so both agree on where a note's properties start and stop.
   */
  private findFrontmatter(lines: string[]): {
    frontmatterStart: number;
    frontmatterEnd: number;
  } {
    return findFrontmatter(lines);
  }

  /**
   * Add a dependency to this note task by updating its frontmatter
   */
  private async addDependencyToFrontmatter(
    vault: Vault,
    fromTask: BaseTask
  ): Promise<void> {
    if (!this.link) return;

    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Extract frontmatter YAML content (excluding the --- delimiters)
      const frontmatterYaml = lines
        .slice(frontmatterStart + 1, frontmatterEnd)
        .join("\n");
      const bodyContent = lines.slice(frontmatterEnd + 1).join("\n");

      // Parse YAML into an object
      const frontmatterData = parseYaml(frontmatterYaml) || {};

      // Extract task name from path (e.g., "TaskNotes/Tasks/Task2.md" -> "Task2")
      const taskName =
        fromTask.text ||
        fromTask.id.split("/").pop()?.replace(/\.md$/, "") ||
        "";
      const uidValue = `[[${taskName}]]`;

      // Ensure blockedBy array exists
      if (!frontmatterData.blockedBy) {
        frontmatterData.blockedBy = [];
      } else if (!Array.isArray(frontmatterData.blockedBy)) {
        frontmatterData.blockedBy = [];
      }

      // Check if dependency already exists
      const exists = frontmatterData.blockedBy.some(
        (dep: DependencyEntry) => dep && dep.uid === uidValue
      );

      if (!exists) {
        frontmatterData.blockedBy.push({
          uid: uidValue,
          reltype: "FINISHTOSTART",
        });
      }

      const newFrontmatterYaml = stringifyYaml(frontmatterData);

      return `---\n${newFrontmatterYaml}---\n${bodyContent}`;
    });
  }

  /**
   * Remove a dependency from this note task by updating its frontmatter
   */
  private async removeDependencyFromFrontmatter(
    vault: Vault,
    fromTaskId: string
  ): Promise<void> {
    if (!this.link) return;

    const file = vault.getFileByPath(this.link);
    if (!file) return;

    await vault.process(file, (fileContent) => {
      const lines = fileContent.split(/\r?\n/);
      const { frontmatterStart, frontmatterEnd } = this.findFrontmatter(lines);

      if (frontmatterStart === -1 || frontmatterEnd === -1) {
        return fileContent;
      }

      // Extract frontmatter YAML content (excluding the --- delimiters)
      const frontmatterYaml = lines
        .slice(frontmatterStart + 1, frontmatterEnd)
        .join("\n");
      const bodyContent = lines.slice(frontmatterEnd + 1).join("\n");

      // Parse YAML into an object
      const frontmatterData = parseYaml(frontmatterYaml) || {};

      // Extract task name from the path (e.g., "TaskNotes/Tasks/Task2.md" -> "Task2")
      // The fromTaskId might be a full path or just a task name
      let taskNameToRemove = fromTaskId;
      if (fromTaskId.includes("/") || fromTaskId.endsWith(".md")) {
        taskNameToRemove =
          fromTaskId.split("/").pop()?.replace(/\.md$/, "") || fromTaskId;
      }

      const uidToRemove = `[[${taskNameToRemove}]]`;

      // Remove the dependency from blockedBy array
      if (Array.isArray(frontmatterData.blockedBy)) {
        frontmatterData.blockedBy = frontmatterData.blockedBy.filter(
          (dep: DependencyEntry) => dep && dep.uid !== uidToRemove
        );

        if (frontmatterData.blockedBy.length === 0) {
          delete frontmatterData.blockedBy;
        }
      }

      const newFrontmatterYaml = stringifyYaml(frontmatterData);

      return `---\n${newFrontmatterYaml}---\n${bodyContent}`;
    });
  }
}
