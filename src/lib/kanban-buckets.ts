/**
 * Buckets for the board.
 *
 * A board is one question asked of every task — "when is it due?", "who has
 * it?", "what state is it in?" — with one column per answer. Dragging a card
 * to another column is answering that question differently, so a bucket knows
 * not only which tasks fall in it but what a drop there would write. That is
 * the whole of the drag-and-drop contract: the view applies a `KanbanChange`
 * and never has to work out per grouping what a drop means.
 *
 * Some groupings have no writer behind them — a task's note, its project, its
 * priority — and those buckets carry a `change` of null. They still group, and
 * cards can still be reordered inside them; they just refuse cards from
 * elsewhere rather than pretending to move something they cannot.
 *
 * Bucketing reads the status written in the file rather than the one
 * `effectiveTaskStatus` derives from progress. The board is where status gets
 * set, so a card has to sit in the column its checkbox says it does — filing a
 * 40%-done todo under "In progress" would make dragging it to "To do" write
 * nothing and snap the card back.
 *
 * A task with several tags, or several people, is filed under its first one.
 * Drawing the same card in every matching column would mean dragging one copy
 * silently moved the others.
 */

import { BaseTask } from "src/types/base-task";
import { TaskStatus } from "../types/task";
import { addDays, diffDays, startOfWeek, toEpochDay } from "./date-utils";
import { normalizeOrderIds } from "./gantt-order";
import { TaskFinance } from "./task-finance";
import { findTaskDate } from "./task-dates";

export type KanbanGroupBy =
  "status" | "due" | "person" | "tag" | "project" | "priority" | "file";

export const KANBAN_GROUP_BY_OPTIONS: KanbanGroupBy[] = [
  "status",
  "due",
  "person",
  "tag",
  "project",
  "priority",
  "file",
];

export function isKanbanGroupBy(value: string): value is KanbanGroupBy {
  return (KANBAN_GROUP_BY_OPTIONS as string[]).includes(value);
}

/** Groupings a drop can write back to the vault. */
export const WRITABLE_GROUP_BY: KanbanGroupBy[] = [
  "status",
  "due",
  "person",
  "tag",
];

export function isWritableGroupBy(groupBy: KanbanGroupBy): boolean {
  return WRITABLE_GROUP_BY.includes(groupBy);
}

/**
 * What dropping a card into a bucket writes. A null value clears the field:
 * dropping into "No date" takes the due date off, and into "Unassigned" takes
 * the people off.
 */
export type KanbanChange =
  | { field: "status"; status: TaskStatus }
  | { field: "due"; due: string | null }
  | { field: "person"; person: string | null }
  | { field: "tag"; tag: string | null };

export interface KanbanBucket {
  key: string;
  label: string;
  /** What a drop here would write, or null when the bucket takes no cards. */
  change: KanbanChange | null;
  tasks: BaseTask[];
}

export const STATUS_BUCKET_ORDER: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "canceled",
];

export const DUE_BUCKET_KEYS = [
  "overdue",
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "later",
  "none",
] as const;

export type DueBucketKey = (typeof DUE_BUCKET_KEYS)[number];

/** Highest first; anything unrecognised sorts after these but before none. */
const PRIORITY_ORDER = ["🔺", "⏫", "🔼", "🔽", "⏬"];

/** The key of the bucket with nothing in it — always drawn last. */
export const NO_VALUE_KEY = "";

export interface BucketLabels {
  status: (_status: TaskStatus) => string;
  due: (_key: DueBucketKey) => string;
  priority: (_value: string) => string;
  noTag: string;
  noPerson: string;
  noProject: string;
  noPriority: string;
}

export interface BuildBucketsOptions {
  today: string;
  labels: BucketLabels;
  /** Manual card order, as task IDs; cards it does not name go last. */
  order?: string[];
}

/** The last day of the week `today` falls in (weeks end on Sunday). */
export function endOfWeek(today: string): string {
  return addDays(startOfWeek(today), 6);
}

/** A task's due date, or null when it carries none. */
export function taskDueDate(task: BaseTask): string | null {
  return findTaskDate(task.dates, "due");
}

/** The person a task is filed under, or "" when nobody has it. */
export function taskPerson(task: BaseTask): string {
  return task.finance.allocations[0]?.person ?? NO_VALUE_KEY;
}

/** The tag a task is filed under, or "" when it carries none. */
export function taskTag(task: BaseTask): string {
  return (
    [...task.tags].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )[0] ?? NO_VALUE_KEY
  );
}

/** Which date bucket a due date falls in, relative to `today`. */
export function dueBucketKey(due: string | null, today: string): DueBucketKey {
  if (!due || toEpochDay(due) === null) return "none";

  const delta = diffDays(today, due);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";

  const toWeekEnd = diffDays(today, endOfWeek(today));
  if (delta <= toWeekEnd) return "this_week";
  if (delta <= toWeekEnd + 7) return "next_week";
  return "later";
}

/** The bucket a task belongs to under a given grouping. */
export function bucketKeyFor(
  task: BaseTask,
  groupBy: KanbanGroupBy,
  today: string
): string {
  switch (groupBy) {
    case "status":
      return task.status;
    case "due":
      return dueBucketKey(taskDueDate(task), today);
    case "person":
      return taskPerson(task);
    case "tag":
      return taskTag(task);
    case "project":
      return task.projects[0] ?? NO_VALUE_KEY;
    case "priority":
      return task.priority || NO_VALUE_KEY;
    case "file":
      return task.link;
  }
}

/**
 * The day a drop into a date bucket writes.
 *
 * Ranges are written to their last day — dropping into "Next week" means "by
 * the end of next week", which is what someone sweeping cards forward means —
 * and "Later" to the day after that, the first day the bucket covers.
 * "Overdue" has no day of its own: nobody drags a card to make it late, so it
 * takes no drops.
 */
export function dueDateForBucket(
  key: DueBucketKey,
  today: string
): string | null | undefined {
  const weekEnd = endOfWeek(today);

  switch (key) {
    case "today":
      return today;
    case "tomorrow":
      return addDays(today, 1);
    case "this_week":
      return weekEnd;
    case "next_week":
      return addDays(weekEnd, 7);
    case "later":
      return addDays(weekEnd, 8);
    case "none":
      return null;
    case "overdue":
      return undefined;
  }
}

/** The finance a task has once it belongs to one person, or to nobody. */
export function assignSolePerson(
  finance: TaskFinance,
  person: string | null
): TaskFinance {
  return {
    ...finance,
    allocations: person ? [{ person, share: 1 }] : [],
  };
}

/** The tags a task has once it moves from one tag column to another. */
export function retagForBucket(
  tags: string[],
  from: string,
  to: string | null
): string[] {
  const kept = from ? tags.filter((tag) => tag !== from) : [...tags];
  if (!to || kept.includes(to)) return kept;
  return [...kept, to];
}

function fileLabel(link: string): string {
  const name = link.split("/").pop() ?? link;
  return name.replace(/\.md$/i, "");
}

/** Tasks rearranged to match the saved card order. */
export function applyCardOrder(
  tasks: BaseTask[],
  order: string[] = []
): BaseTask[] {
  const rank = new Map<string, number>();
  normalizeOrderIds(
    tasks.map((task) => task.id),
    order
  ).forEach((id, index) => rank.set(id, index));

  return [...tasks].sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  );
}

/**
 * The card order that puts the most pressing work at the top of every column.
 *
 * Earliest due date first, and everything carrying no date after it — an
 * undated card is not urgent, it is unplanned, and burying it under next
 * month's work would be a lie either way. Ties fall back to the task's name so
 * the order is stable between reloads.
 */
export function orderTasksByDue(tasks: BaseTask[]): string[] {
  return [...tasks]
    .sort((a, b) => {
      const dueA = taskDueDate(a);
      const dueB = taskDueDate(b);

      if (dueA && dueB && dueA !== dueB) return diffDays(dueB, dueA);
      if (dueA && !dueB) return -1;
      if (!dueA && dueB) return 1;

      return a.summary.localeCompare(b.summary, undefined, {
        sensitivity: "base",
      });
    })
    .map((task) => task.id);
}

/**
 * The fixed columns of a grouping: the ones drawn whether or not they hold
 * anything, because they are the answers the question has.
 *
 * "Overdue" is deliberately not among them. It is the one date bucket a user
 * cannot put a card in on purpose, so an empty one is a column of wasted
 * space rather than somewhere to drop work.
 */
function fixedBuckets(
  groupBy: KanbanGroupBy,
  today: string,
  labels: BucketLabels
): Array<{ key: string; label: string; change: KanbanChange | null }> {
  if (groupBy === "status") {
    return STATUS_BUCKET_ORDER.map((status) => ({
      key: status,
      label: labels.status(status),
      change: { field: "status", status } as KanbanChange,
    }));
  }

  if (groupBy !== "due") return [];

  return DUE_BUCKET_KEYS.filter((key) => {
    if (key === "overdue") return false;
    // A Saturday has no "rest of this week" left to drop anything into
    if (key === "this_week") return diffDays(today, endOfWeek(today)) > 1;
    return true;
  }).map((key) => {
    const due = dueDateForBucket(key, today);
    return {
      key,
      label: labels.due(key),
      change: due === undefined ? null : { field: "due", due },
    };
  });
}

/** The label and the drop behaviour of a bucket built from the tasks in it. */
function dynamicBucket(
  groupBy: KanbanGroupBy,
  key: string,
  task: BaseTask,
  labels: BucketLabels
): { label: string; change: KanbanChange | null } {
  switch (groupBy) {
    case "person":
      return {
        label: key || labels.noPerson,
        change: { field: "person", person: key || null },
      };
    case "tag":
      return {
        label: key ? `#${key}` : labels.noTag,
        change: { field: "tag", tag: key || null },
      };
    case "priority":
      return {
        label: key ? labels.priority(key) : labels.noPriority,
        change: null,
      };
    case "project":
      return { label: key || labels.noProject, change: null };
    case "file":
      return { label: fileLabel(task.link), change: null };
    case "due":
      // Only "overdue" reaches here: every other date bucket is a fixed column
      return { label: labels.due(key as DueBucketKey), change: null };
    default:
      return { label: labels.status(key as TaskStatus), change: null };
  }
}

function sortDynamicBuckets(
  buckets: KanbanBucket[],
  groupBy: KanbanGroupBy
): KanbanBucket[] {
  if (groupBy === "priority") {
    return buckets.sort((a, b) => {
      const rankA = PRIORITY_ORDER.indexOf(a.key);
      const rankB = PRIORITY_ORDER.indexOf(b.key);
      return (
        (rankA === -1 ? PRIORITY_ORDER.length : rankA) -
        (rankB === -1 ? PRIORITY_ORDER.length : rankB)
      );
    });
  }

  return buckets.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

/**
 * Splits tasks into the columns of a board.
 *
 * Fixed columns come first and in their own order — the states a task can be
 * in, the days ahead — and the columns a grouping discovers from the tasks
 * themselves are sorted by label after them. The bucket holding everything
 * with no answer at all ("No tag", "Unassigned") is always last, whichever
 * kind of grouping it came from, because a column of leftovers reads worst
 * first.
 *
 * Overdue work is the exception at the other end: it is discovered rather than
 * fixed, but when there is any it leads the board. What is already late is the
 * first thing somebody opening a board needs to see.
 */
export function buildBuckets(
  tasks: BaseTask[],
  groupBy: KanbanGroupBy,
  options: BuildBucketsOptions
): KanbanBucket[] {
  const { today, labels } = options;
  const ordered = applyCardOrder(tasks, options.order);

  const buckets = new Map<string, KanbanBucket>();
  for (const fixed of fixedBuckets(groupBy, today, labels)) {
    buckets.set(fixed.key, { ...fixed, tasks: [] });
  }

  const discovered: KanbanBucket[] = [];

  for (const task of ordered) {
    const key = bucketKeyFor(task, groupBy, today);

    const existing = buckets.get(key);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }

    const bucket: KanbanBucket = {
      key,
      tasks: [task],
      ...dynamicBucket(groupBy, key, task, labels),
    };
    buckets.set(key, bucket);
    discovered.push(bucket);
  }

  const fixedOrder = fixedBuckets(groupBy, today, labels).map(
    (bucket) => bucket.key
  );
  const leading = fixedOrder
    .map((key) => buckets.get(key))
    .filter((bucket): bucket is KanbanBucket => bucket !== undefined);

  const overdue =
    groupBy === "due"
      ? discovered.filter((bucket) => bucket.key === "overdue")
      : [];

  const trailing = sortDynamicBuckets(
    discovered.filter((bucket) => !overdue.includes(bucket)),
    groupBy
  );

  return [
    ...overdue,
    ...leading,
    ...trailing.filter((bucket) => bucket.key !== NO_VALUE_KEY),
    ...trailing.filter((bucket) => bucket.key === NO_VALUE_KEY),
  ];
}
