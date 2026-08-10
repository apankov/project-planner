import { addDays, diffDays } from "./date-utils";
import { GanttRow } from "./gantt-rows";
import { traverseGraph } from "./traverse-graph";

/**
 * Dragging a slip through the rest of the plan.
 *
 * Shift-dragging a bar moves that task *and* every task that starts later than
 * it by the same number of days. The rule is deliberately about dates rather
 * than dependencies: a plan slips as a block, and most tasks in a real vault
 * are never formally linked to anything, so a walk of the dependency graph
 * would leave most of the work that ought to move sitting where it was.
 *
 * Tasks waiting on the dragged one come along regardless of how their own
 * dates read, so a dependent that is mis-dated to start early is not left
 * behind by the date rule.
 *
 * The shift is rigid on purpose: every relationship inside the moving set is
 * preserved exactly, and what lands on screen is what the drag promised.
 * Working out which tasks could have absorbed the slip in their float is a
 * different job, and a rescheduling command is the honest place for it — not a
 * gesture that showed the whole plan moving as one.
 *
 * Three things hold the move back from what was asked for:
 *
 * - **Proposals stay put.** A bar whose dates were only inferred is a
 *   suggestion, and moving it would write dates the user never set as a side
 *   effect of dragging something else.
 *
 * - **Finished work stays put.** A done or cancelled task's dates are a record
 *   of what happened, not a plan to be pushed around. This matters far more
 *   under the date rule than it did under a dependency walk, which rarely
 *   reached completed work at all.
 *
 * - **Tasks left behind can object.** Dragging backwards can push the moving
 *   set in front of a blocker that is not coming with it, so the move is
 *   clamped to the room actually available.
 *
 * The clamp is measured in calendar days even when the chart is in
 * working-days mode. That direction is safe: skipping weekends only ever
 * nudges a start *later*, which is the legal direction, so a clamp computed on
 * calendar days can leave a day of room unused but can never permit an overlap
 * it should have caught.
 */

export interface CascadePlan {
  /** Every task that moves, seed included, in row order. */
  movingIds: string[];
  /**
   * The shift actually applied, in days — never further than was asked for.
   * Zero means a blocker left the plan no room to move at all.
   */
  days: number;
  /** Rows left where they are because their dates are only proposals. */
  skippedInferredIds: string[];
  /** Rows left where they are because the work is already finished. */
  skippedCompletedIds: string[];
  /** Whether a task outside the moving set shortened the drag. */
  clamped: boolean;
}

const EMPTY_PLAN: CascadePlan = {
  movingIds: [],
  days: 0,
  skippedInferredIds: [],
  skippedCompletedIds: [],
  clamped: false,
};

/** Work that has already happened, whose dates are a record rather than a plan. */
function isFinished(status: GanttRow["task"]["status"]): boolean {
  return status === "done" || status === "canceled";
}

/**
 * Works out which rows a shift-drag of `seedId` should carry, and how far they
 * can actually go.
 *
 * Cycles are safe: the downstream walk visits each task once, so a pair of
 * mutually blocking tasks resolves rather than recursing forever.
 */
export function planCascade(
  seedId: string,
  rows: GanttRow[],
  days: number
): CascadePlan {
  const rowById = new Map(rows.map((row) => [row.task.id, row]));
  const seed = rowById.get(seedId);
  if (!seed) return EMPTY_PLAN;

  const dependents = new Set(
    traverseGraph(
      [seedId],
      rows.map((row) => row.task),
      new Set(rowById.keys()),
      "downstream"
    )
  );

  const movingIds: string[] = [];
  const skippedInferredIds: string[] = [];
  const skippedCompletedIds: string[] = [];

  for (const row of rows) {
    const id = row.task.id;

    // The seed moves whatever its dates or status say: the user grabbed it
    // deliberately, and dragging a proposed bar is how it gets committed.
    if (id === seedId) {
      movingIds.push(id);
      continue;
    }

    // Strictly later, so work starting on the same day as the dragged task
    // counts as running alongside it rather than following it
    const startsLater = diffDays(seed.bar.start, row.bar.start) > 0;
    if (!startsLater && !dependents.has(id)) continue;

    if (isFinished(row.task.status)) {
      skippedCompletedIds.push(id);
      continue;
    }
    if (row.inferred) {
      skippedInferredIds.push(id);
      continue;
    }

    movingIds.push(id);
  }

  const clampedDays = clampToBlockers(movingIds, rowById, days);

  return {
    movingIds,
    days: clampedDays,
    skippedInferredIds,
    skippedCompletedIds,
    clamped: clampedDays !== days,
  };
}

/**
 * Shortens a backwards drag until it no longer pushes any moving row in front
 * of a blocker that is staying where it is.
 *
 * Only blockers outside the moving set are consulted — links inside it survive
 * a rigid shift untouched — and inferred blockers are ignored, since their
 * dates are the scheduler's guess and will simply be recomputed after the
 * write rather than standing as a commitment to respect.
 */
function clampToBlockers(
  movingIds: string[],
  rowById: Map<string, GanttRow>,
  days: number
): number {
  if (days >= 0) return days;

  const moving = new Set(movingIds);
  let room = Number.POSITIVE_INFINITY;

  for (const id of movingIds) {
    const row = rowById.get(id);
    if (!row) continue;

    for (const blockerId of row.task.incomingLinks) {
      if (moving.has(blockerId)) continue;

      const blocker = rowById.get(blockerId);
      if (!blocker || blocker.inferred) continue;

      // Days between the earliest legal start and where this row sits now.
      // A row already overlapping its blocker reports no room: the drag must
      // not deepen a conflict, and quietly repairing one is not its job.
      const available = diffDays(addDays(blocker.bar.end, 1), row.bar.start);
      room = Math.min(room, Math.max(0, available));
    }
  }

  if (room === Number.POSITIVE_INFINITY) return days;

  // `Math.max` hands back -0 when the room runs out, which reads as a negative
  // day count everywhere it is later formatted
  const clamped = Math.max(days, -room);
  return clamped === 0 ? 0 : clamped;
}
