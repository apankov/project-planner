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
 * **The drag always lands.** The bar under the pointer goes exactly where it
 * was dropped — a plain drag has never been second-guessed, and holding shift
 * is not a reason to start. The rest of the set follows as far as it can and
 * settles where it must, so a single awkward predecessor slows one task down
 * instead of cancelling the whole gesture.
 *
 * Two things keep a task out of the move entirely:
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
 * and one thing shortens how far a task travels:
 *
 * - **Tasks left behind can object.** Dragging backwards can push a carried
 *   task in front of a blocker that is not coming with it, so that task stops
 *   the day after its blocker ends. Its own dependents are then measured
 *   against where it actually landed, so the set arrives in an order that
 *   still holds together rather than sliding through itself.
 *
 * Room is measured in calendar days even when the chart is in working-days
 * mode. That direction is safe: skipping weekends only ever nudges a start
 * *later*, which is the legal direction, so room computed on calendar days can
 * leave a day unused but can never permit an overlap it should have caught.
 */

export interface CascadePlan {
  /** Every task that actually moves, seed included, in row order. */
  movingIds: string[];
  /** The shift the dragged bar takes, in days — always what was asked for. */
  days: number;
  /**
   * How far each moving task travels, in days. Everything moves by `days`
   * unless a blocker staying behind stopped it short.
   */
  shiftById: Map<string, number>;
  /** Rows left where they are because their dates are only proposals. */
  skippedInferredIds: string[];
  /** Rows left where they are because the work is already finished. */
  skippedCompletedIds: string[];
  /** Rows a blocker stopped short of the full shift, some of them entirely. */
  heldIds: string[];
}

function emptyPlan(): CascadePlan {
  return {
    movingIds: [],
    days: 0,
    shiftById: new Map(),
    skippedInferredIds: [],
    skippedCompletedIds: [],
    heldIds: [],
  };
}

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
  if (!seed) return emptyPlan();

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

  const shiftById = resolveShifts(seedId, movingIds, rowById, days);

  return {
    // A task a blocker stopped dead is not moving, whatever the plan wanted
    movingIds: movingIds.filter((id) => shiftById.get(id) !== 0),
    days,
    shiftById,
    skippedInferredIds,
    skippedCompletedIds,
    heldIds: movingIds.filter((id) => shiftById.get(id) !== days),
  };
}

/**
 * Works out how far each moving row can actually travel.
 *
 * A backwards drag is the only one that can run into anything: moving work
 * later never puts it in front of a blocker. So a forwards drag is uniform,
 * and a backwards one is resolved blocker-first — each row stops the day after
 * whatever blocks it, and its own dependents are then measured against where
 * it landed rather than where it was asked to go. Relationships inside the set
 * therefore survive even when part of the set could not keep up.
 *
 * Inferred blockers are ignored: their dates are the scheduler's guess and
 * will simply be recomputed after the write rather than standing as a
 * commitment to respect.
 *
 * Cycles are broken by ignoring the edge that closes them, the same way
 * `scheduleTasks` does when it lays the bars out in the first place.
 */
function resolveShifts(
  seedId: string,
  movingIds: string[],
  rowById: Map<string, GanttRow>,
  days: number
): Map<string, number> {
  // The bar under the pointer goes where it was dropped, blockers or not —
  // that is what a plain drag does, and shift is not a reason to disagree
  const shifts = new Map<string, number>([[seedId, days]]);

  if (days >= 0) {
    for (const id of movingIds) shifts.set(id, days);
    return shifts;
  }

  const moving = new Set(movingIds);
  const resolving = new Set<string>();

  function shiftOf(id: string): number {
    const known = shifts.get(id);
    if (known !== undefined) return known;

    const row = rowById.get(id);
    if (!row) return days;

    resolving.add(id);

    let shift = days;
    for (const blockerId of row.task.incomingLinks) {
      const blocker = rowById.get(blockerId);
      if (!blocker || blocker.inferred || resolving.has(blockerId)) continue;

      // Days between where this row sits now and the earliest start its
      // blocker allows, once the blocker has taken its own shift
      const room = diffDays(addDays(blocker.bar.end, 1), row.bar.start);
      const blockerShift = moving.has(blockerId) ? shiftOf(blockerId) : 0;
      shift = Math.max(shift, blockerShift - room);
    }

    resolving.delete(id);

    // Never further back than asked, and never forwards: a row already
    // overlapping its blocker stays where it is, because a drag asked to move
    // work back has no business quietly repairing a conflict it did not make.
    // `Math.max` also hands back -0 when the room runs out, which reads as a
    // negative day count everywhere it is later formatted.
    const settled = Math.min(0, shift) || 0;
    shifts.set(id, settled);
    return settled;
  }

  for (const id of movingIds) shiftOf(id);
  return shifts;
}
