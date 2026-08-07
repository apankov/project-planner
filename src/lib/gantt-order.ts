import { diffDays } from "./date-utils";
import { GanttRow } from "./gantt-rows";

/**
 * Row ordering and grouping for the Gantt.
 *
 * The chart's running order is a plain list of task IDs held in settings.
 * Rows are drawn in that order, so dragging a row is only ever a change to
 * the list, and sorting by date is just one particular list the user can ask
 * for (and undo) rather than something the chart does on its own.
 */

export type GanttGroupBy = "none" | "tag" | "status" | "file" | "project";

export const GANTT_GROUP_BY_OPTIONS: GanttGroupBy[] = [
  "none",
  "tag",
  "status",
  "file",
  "project",
];

export interface GanttGroup {
  key: string;
  label: string;
  rows: GanttRow[];
}

export function isGanttGroupBy(value: string): value is GanttGroupBy {
  return (GANTT_GROUP_BY_OPTIONS as string[]).includes(value);
}

/**
 * The stored order, restricted to the rows present and extended with any row
 * it has not seen yet (new tasks land at the end rather than jumping to the
 * top).
 */
export function normalizeOrder(rows: GanttRow[], order: string[]): string[] {
  const present = new Set(rows.map((row) => row.task.id));
  const seen = new Set<string>();
  const next: string[] = [];

  for (const id of order) {
    if (!present.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }

  for (const row of rows) {
    if (seen.has(row.task.id)) continue;
    seen.add(row.task.id);
    next.push(row.task.id);
  }

  return next;
}

/** Rows rearranged to match the given order. */
export function applyOrder(rows: GanttRow[], order: string[]): GanttRow[] {
  const rank = new Map<string, number>();
  normalizeOrder(rows, order).forEach((id, index) => rank.set(id, index));

  return [...rows].sort(
    (a, b) => (rank.get(a.task.id) ?? 0) - (rank.get(b.task.id) ?? 0)
  );
}

/**
 * Moves `movedId` to sit directly before or after `targetId`.
 *
 * Working in terms of a neighbour rather than an absolute index means a drag
 * lands where the user dropped it even when the list is filtered or grouped
 * and most rows are hidden.
 */
export function moveRelativeTo(
  order: string[],
  movedId: string,
  targetId: string,
  placement: "before" | "after"
): string[] {
  if (movedId === targetId) return [...order];

  const without = order.filter((id) => id !== movedId);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex === -1) return [...order];

  const insertAt = placement === "before" ? targetIndex : targetIndex + 1;
  without.splice(insertAt, 0, movedId);
  return without;
}

/** The order the rows would have if sorted earliest-first. */
export function orderByDate(rows: GanttRow[]): string[] {
  return [...rows]
    .sort((a, b) => {
      // diffDays(b, a) is a - b in days, i.e. ascending by date
      const byStart = diffDays(b.bar.start, a.bar.start);
      if (byStart !== 0) return byStart;

      const byEnd = diffDays(b.bar.end, a.bar.end);
      if (byEnd !== 0) return byEnd;

      return a.task.summary.localeCompare(b.task.summary, undefined, {
        sensitivity: "base",
      });
    })
    .map((row) => row.task.id);
}

function fileLabel(link: string): string {
  const name = link.split("/").pop() ?? link;
  return name.replace(/\.md$/i, "");
}

const STATUS_ORDER = ["in_progress", "todo", "done", "canceled"];

/**
 * Splits rows into groups, keeping the incoming row order inside each group.
 *
 * A task with several tags is filed under its first one: putting it in every
 * matching group would draw the same bar more than once, and dragging one
 * copy would silently move the others.
 */
export function groupRows(
  rows: GanttRow[],
  groupBy: GanttGroupBy,
  labels: {
    untagged: string;
    noProject: string;
    status: (_s: string) => string;
  }
): GanttGroup[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "", rows }];
  }

  const groups = new Map<string, GanttGroup>();

  const push = (key: string, label: string, row: GanttRow) => {
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      return;
    }
    groups.set(key, { key, label, rows: [row] });
  };

  for (const row of rows) {
    if (groupBy === "tag") {
      const tag = [...row.task.tags].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      )[0];
      push(tag ?? "", tag ? `#${tag}` : labels.untagged, row);
      continue;
    }

    if (groupBy === "status") {
      push(row.task.status, labels.status(row.task.status), row);
      continue;
    }

    if (groupBy === "file") {
      push(row.task.link, fileLabel(row.task.link), row);
      continue;
    }

    const project = row.task.projects[0];
    push(project ?? "", project ?? labels.noProject, row);
  }

  const ordered = Array.from(groups.values());

  if (groupBy === "status") {
    return ordered.sort(
      (a, b) => STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key)
    );
  }

  // Empty key means "none of these", which reads best last
  return ordered.sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}
