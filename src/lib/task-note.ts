/**
 * The companion note as a task's property store.
 *
 * A checkbox line has nowhere to put detail, so a task's properties live in the
 * note its line links to: dates, owner, contributors, hours, progress, parent
 * and dependencies are all frontmatter keys there. What stays on the line is
 * what the line is good at — the checkbox, the link and the id — which keeps the
 * task list readable and puts every property in Obsidian's own properties panel
 * when you open the note.
 *
 * `NoteTask` has always worked this way; this is what lets a `DataviewTask` do
 * the same, so both kinds of task read and write through one set of helpers.
 *
 * A note is only accepted as a store when it says it is one. The `task-note`
 * marker written by `companion-note` is the whole test: without it, a task
 * whose text happens to link to a design doc would quietly start writing hours
 * and owners into that doc. A note tagged `task` is refused for the opposite
 * reason — the plugin already reads that note as a task in its own right, and
 * writing to it here would have two tasks fighting over one file.
 */

import { App, TFile } from "obsidian";
import { BaseTask } from "src/types/base-task";
import { TaskStatus } from "src/types/task";
import {
  TaskDateProperty,
  TaskDateType,
  frontmatterKeyForDate,
  frontmatterKeysForDate,
  getFrontmatterDateProperties,
} from "./task-dates";
import {
  TaskFinance,
  financeFrontmatterPatch,
  getFrontmatterFinance,
} from "./task-finance";
import {
  TaskProgress,
  getFrontmatterProgress,
  progressFrontmatterPatch,
} from "./task-progress";
import { getFrontmatterParentId, parentFrontmatterPatch } from "./task-parent";
import { getFrontmatterOwner, ownerFrontmatterPatch } from "./task-owner";
import { FrontmatterPatch, mergeFrontmatterPatches } from "./frontmatter-write";

/** The frontmatter key marking a note as a task's property store. */
export const TASK_NOTE_MARKER = "task-note";

/** The key a companion note lists the tasks it waits on under. */
const DEPENDS_ON_FIELD = "dependsOn";

/**
 * The tag that turns a note into a task in its own right. It is filtered out
 * of anything written here: a companion note carrying it would be drawn as a
 * second node for the task that owns it.
 */
const TASK_TAG = "task";

/** Everything a task keeps in its note. */
export interface TaskNoteProperties {
  dates: TaskDateProperty[];
  finance: TaskFinance;
  progress: TaskProgress;
  parentId: string | null;
  owner: string | null;
  tags: string[];
  incomingLinks: string[];
  /** Absent when the note says nothing about status; the checkbox decides. */
  status: TaskStatus | null;
}

/** The fields a write can change. An absent key is left alone. */
export interface TaskNoteChanges {
  dates?: Record<string, string | null>;
  finance?: TaskFinance;
  progress?: TaskProgress;
  parentId?: string | null;
  owner?: string | null;
  tags?: string[];
  incomingLinks?: string[];
  status?: TaskStatus;
}

/* -------------------------------------------------------------------------- */
/* Finding the note                                                           */
/* -------------------------------------------------------------------------- */

/** The first wiki-link in a piece of text, as a link path. */
export function firstWikiLink(text: string): string | null {
  const match = text.match(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/);
  if (!match) return null;

  const linkpath = match[1].trim();
  return linkpath.length > 0 ? linkpath : null;
}

/** True when a note's frontmatter marks it as a task's property store. */
export function isTaskNoteFrontmatter(
  frontmatter: Record<string, unknown> | undefined
): boolean {
  if (!frontmatter) return false;
  if (frontmatter[TASK_NOTE_MARKER] !== true) return false;

  // A note the plugin already reads as a task of its own is not a store
  const tags = frontmatter.tags;
  const carriesTaskTag = Array.isArray(tags)
    ? tags.some((tag) => tag === TASK_TAG || tag === `#${TASK_TAG}`)
    : tags === TASK_TAG || tags === `#${TASK_TAG}`;

  return !carriesTaskTag;
}

/**
 * The note holding this task's properties, or null when it has none.
 *
 * Only inline tasks have one: a note task *is* its note, and asking it to
 * follow a link out of its own title would send it somewhere else entirely.
 */
export function companionNoteFor(app: App, task: BaseTask): TFile | null {
  if (task.type !== "dataview") return null;

  const linkpath = firstWikiLink(task.summary) ?? firstWikiLink(task.text);
  if (!linkpath) return null;

  const file = app.metadataCache.getFirstLinkpathDest(
    linkpath,
    task.link ?? ""
  );
  if (!file) return null;

  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  return isTaskNoteFrontmatter(frontmatter) ? file : null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** How a note spells each status. */
const NOTE_STATUS_VALUES: Record<TaskStatus, string> = {
  todo: "open",
  in_progress: "in-progress",
  done: "done",
  canceled: "canceled",
};

/** The value written to a note's `status:` key. */
export function noteStatusValue(status: TaskStatus): string {
  return NOTE_STATUS_VALUES[status];
}

/** The status a note's `status:` key names, or null when it names none. */
export function statusFromNoteValue(value: unknown): TaskStatus | null {
  if (typeof value !== "string") return null;

  switch (value.trim().toLowerCase()) {
    case "open":
    case "todo":
      return "todo";
    case "in-progress":
    case "in progress":
    case "in_progress":
      return "in_progress";
    case "done":
    case "complete":
    case "completed":
      return "done";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return null;
  }
}

/** The dependencies a note lists, as task ids. */
function readDependsOn(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter[DEPENDS_ON_FIELD];
  if (value === undefined || value === null) return [];

  const entries = Array.isArray(value) ? value : [value];

  return entries
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .map((entry) => entry.replace(/^\[\[(.*)\]\]$/, "$1").trim())
    .filter((entry) => entry.length > 0);
}

/** The tags a note lists, without the leading `#` and without `task`. */
function readTags(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.tags;
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];

  return entries
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag.length > 0 && tag !== TASK_TAG);
}

/** Everything a note says about the task that links to it. */
export function readTaskNoteProperties(
  frontmatter: Record<string, unknown>
): TaskNoteProperties {
  return {
    dates: getFrontmatterDateProperties(frontmatter),
    finance: getFrontmatterFinance(frontmatter),
    progress: getFrontmatterProgress(frontmatter),
    parentId: getFrontmatterParentId(frontmatter),
    owner: getFrontmatterOwner(frontmatter),
    tags: readTags(frontmatter),
    incomingLinks: readDependsOn(frontmatter),
    status: statusFromNoteValue(frontmatter.status),
  };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/** What to change in a note's frontmatter to make it say this. */
export function taskNotePatch(changes: TaskNoteChanges): FrontmatterPatch {
  const patches: FrontmatterPatch[] = [];

  if (changes.dates) {
    const set: Record<string, unknown> = {};
    const remove: string[] = [];

    for (const [name, date] of Object.entries(changes.dates)) {
      const type = name as TaskDateType;
      if (date === null) {
        // Every spelling goes, or a note written with `dueDate:` would keep
        // the date the user just cleared through `due:`
        remove.push(...frontmatterKeysForDate(type));
      } else {
        set[frontmatterKeyForDate(type)] = date;
        remove.push(
          ...frontmatterKeysForDate(type).filter(
            (key) => key !== frontmatterKeyForDate(type)
          )
        );
      }
    }

    patches.push({ set, remove });
  }

  if (changes.finance) patches.push(financeFrontmatterPatch(changes.finance));
  if (changes.progress) {
    patches.push(progressFrontmatterPatch(changes.progress));
  }
  if (changes.parentId !== undefined) {
    patches.push(parentFrontmatterPatch(changes.parentId));
  }
  if (changes.owner !== undefined) {
    patches.push(ownerFrontmatterPatch(changes.owner));
  }

  if (changes.tags) {
    // `task` is filtered out rather than refused: someone tagging a task #task
    // meant to label it, not to have the plugin draw a second node for its note
    const tags = changes.tags
      .map((tag) => tag.replace(/^#/, "").trim())
      .filter((tag) => tag.length > 0 && tag !== TASK_TAG);

    patches.push(
      tags.length > 0
        ? { set: { tags }, remove: [] }
        : { set: {}, remove: ["tags"] }
    );
  }

  if (changes.incomingLinks) {
    const ids = changes.incomingLinks.filter((id) => id.trim().length > 0);
    patches.push(
      ids.length > 0
        ? { set: { [DEPENDS_ON_FIELD]: ids }, remove: [] }
        : { set: {}, remove: [DEPENDS_ON_FIELD] }
    );
  }

  if (changes.status) {
    patches.push({
      set: { status: noteStatusValue(changes.status) },
      remove: [],
    });
  }

  return mergeFrontmatterPatches(patches);
}

/**
 * A task with its note's properties laid over the ones read off its line.
 *
 * The note wins everywhere it has an answer, because it is the store — except
 * for status, which the checkbox owns. Ticking a box in the task list is the
 * fastest edit in the plugin and has to keep working without the note being
 * rewritten first, so `updateStatus` mirrors the checkbox into the note rather
 * than the other way round.
 */
export function withNoteProperties(
  task: BaseTask,
  properties: TaskNoteProperties
): BaseTask {
  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(task)),
    task
  ) as BaseTask;

  if (properties.dates.length > 0) merged.dates = properties.dates;
  if (properties.progress.percent !== null) {
    merged.progress = properties.progress;
  }
  if (properties.parentId !== null) merged.parentId = properties.parentId;
  if (properties.owner !== null) merged.owner = properties.owner;
  if (properties.tags.length > 0) {
    merged.tags = Array.from(new Set([...task.tags, ...properties.tags]));
  }
  if (properties.incomingLinks.length > 0) {
    merged.incomingLinks = Array.from(
      new Set([...task.incomingLinks, ...properties.incomingLinks])
    );
  }

  // Finance is one field, not four: a note carrying people but no hours still
  // replaces the line's costing wholesale, or the two would interleave
  const finance = properties.finance;
  const noteHasFinance =
    finance.hoursPerDay !== null ||
    finance.totalHours !== null ||
    finance.allocations.length > 0 ||
    finance.expenses.length > 0;
  if (noteHasFinance) merged.finance = finance;

  return merged;
}
