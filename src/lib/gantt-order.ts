import { diffDays } from "./date-utils";
import { GanttRow } from "./gantt-rows";
import { collectDescendantIds } from "./task-hierarchy";

/**
 * Row ordering and grouping for the Gantt.
 *
 * The chart's running order is a plain list of task IDs held in settings.
 * Rows are drawn in that order, so dragging a row is only ever a change to
 * the list, and sorting by date is just one particular list the user can ask
 * for (and undo) rather than something the chart does on its own.
 *
 * The list stays flat even though the chart nests. Nesting is applied when the
 * rows are drawn (`task-hierarchy`), which is what keeps a child inside its
 * parent whatever the list says: the list only ever decides the order of
 * siblings. Dragging is the one place the two meet, and `moveWithinParent` is
 * where that is worked out.
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

/**
 * Moves `movedId` next to `targetId`, without letting it leave its parent.
 *
 * Two rules, both of which fall out of the chart nesting rows it is given a
 * flat order for:
 *
 * - A row can only be dropped among its own siblings. Dropping onto a row
 *   deeper in the tree means "next to the ancestor of yours that I landed in",
 *   which is what makes dragging a task onto a collapsed parent's neighbour do
 *   what it looks like it does. A drop with no such ancestor — the pointer was
 *   over another parent's subtree entirely — is refused rather than quietly
 *   put somewhere else, because reparenting is a separate, deliberate action.
 * - A parent takes its children with it, so a subtree moves as one block.
 *
 * `parentById` must be the resolved map from `task-hierarchy`, i.e. the
 * structure actually on screen, not the raw `parentId` the tasks carry: a row
 * whose parent was filtered out of view is a root here, and is draggable like
 * one. The ancestor walk is capped anyway, so a caller that passes a map with
 * a loop still left in it gets a refused drop rather than a hung view.
 */
export function moveWithinParent(
  order: string[],
  movedId: string,
  targetId: string,
  placement: "before" | "after",
  parentById: ReadonlyMap<string, string | null>
): string[] {
  if (movedId === targetId) return [...order];

  const movedParent = parentById.get(movedId) ?? null;

  let sibling: string | null = targetId;
  for (let steps = 0; steps <= parentById.size; steps++) {
    if (sibling === null) break;
    if ((parentById.get(sibling) ?? null) === movedParent) break;
    sibling = parentById.get(sibling) ?? null;
  }

  // No sibling to land beside, or the target sits inside the row being moved
  if (sibling === null || sibling === movedId) return [...order];
  if ((parentById.get(sibling) ?? null) !== movedParent) return [...order];

  const moving = collectDescendantIds(parentById, movedId);
  const block = order.filter((id) => id === movedId || moving.has(id));
  if (block.length === 0) return [...order];

  const without = order.filter((id) => id !== movedId && !moving.has(id));
  const targetIndex = without.indexOf(sibling);
  if (targetIndex === -1) return [...order];

  let insertAt = targetIndex;
  if (placement === "after") {
    // Past the sibling's own children: "after" means after the whole of it,
    // not wedged between it and the first row nested underneath
    const siblingSubtree = collectDescendantIds(parentById, sibling);
    insertAt = targetIndex + 1;
    while (insertAt < without.length && siblingSubtree.has(without[insertAt])) {
      insertAt += 1;
    }
  }

  without.splice(insertAt, 0, ...block);
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
