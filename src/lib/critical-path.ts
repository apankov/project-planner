import {
  addDays,
  addWorkingDays,
  diffDays,
  previousWorkingDay,
  workingDayCount,
} from "./date-utils";
import { barLength } from "./gantt-schedule";
import { connectionKey } from "./connection-highlight";

/**
 * The critical path through a plan.
 *
 * Every bar has a latest finish it could get away with before the plan as a
 * whole slips: a task with nothing waiting on it can run right up to the end of
 * the plan, and a task with successors has to be out of the way in time for
 * them. The gap between when a task actually finishes and that latest finish is
 * its float — the days it can slip before anyone downstream notices. Tasks with
 * no float are the critical path, and they are the ones worth arguing about
 * when a deadline is at risk; everything else has room to move.
 *
 * This is the backward pass of the critical path method, run over the bars the
 * chart already laid out rather than over durations on their own, so it
 * describes the plan on screen and not a second, invisible one. Inferred bars
 * count: a suggested date is still the date the chart is showing.
 */

export interface CriticalPathTask {
  id: string;
  /** IDs of the tasks that must finish before this one starts. */
  incomingLinks: string[];
  start: string;
  end: string;
}

export interface CriticalPathOptions {
  /** Measure float in working days, matching how the bars were laid out. */
  skipWeekends?: boolean;
}

export interface CriticalPath {
  /** Tasks with no float: slipping any of them slips the whole plan. */
  criticalIds: Set<string>;
  /** Days each task can slip before the finish date moves. May be negative. */
  floatByTaskId: Map<string, number>;
  /** Dependencies with no slack between them, keyed `blocker->task`. */
  criticalEdgeKeys: Set<string>;
  /** The last day any task finishes, or null when there are no tasks. */
  projectFinish: string | null;
}

export const EMPTY_CRITICAL_PATH: CriticalPath = {
  criticalIds: new Set(),
  floatByTaskId: new Map(),
  criticalEdgeKeys: new Set(),
  projectFinish: null,
};

function earlier(a: string, b: string): string {
  return diffDays(a, b) < 0 ? b : a;
}

function later(a: string, b: string): string {
  return diffDays(a, b) > 0 ? b : a;
}

/** The last day before `iso` that work could happen on. */
function dayBefore(iso: string, skipWeekends: boolean): string {
  const previous = addDays(iso, -1);
  return skipWeekends ? previousWorkingDay(previous) : previous;
}

/**
 * The start a bar of `length` would need to finish on `end` — the mirror of
 * `addDuration`, which counts the same way from the other end.
 */
function subtractDuration(
  end: string,
  length: number,
  skipWeekends: boolean
): string {
  const steps = Math.max(0, length - 1);
  return skipWeekends ? addWorkingDays(end, -steps) : addDays(end, -steps);
}

/**
 * Days between a bar's end and the latest end it could have had. Negative
 * float — a task already finishing later than the plan allows — is reported in
 * calendar days, because "three days over" reads the same either way and the
 * working-day count has no meaning once the window has closed.
 */
function floatDays(
  end: string,
  lateFinish: string,
  skipWeekends: boolean
): number {
  const calendar = diffDays(end, lateFinish);
  if (calendar <= 0 || !skipWeekends) return calendar;
  return workingDayCount(end, lateFinish) - 1;
}

export function findCriticalPath(
  tasks: CriticalPathTask[],
  options: CriticalPathOptions = {}
): CriticalPath {
  if (tasks.length === 0) return EMPTY_CRITICAL_PATH;

  const skipWeekends = options.skipWeekends ?? false;

  const byId = new Map<string, CriticalPathTask>();
  tasks.forEach((task) => byId.set(task.id, task));

  // The links read the other way round: who is waiting on each task
  const successors = new Map<string, string[]>();
  for (const task of tasks) {
    for (const blockerId of task.incomingLinks) {
      if (blockerId === task.id || !byId.has(blockerId)) continue;
      const existing = successors.get(blockerId);
      if (existing) {
        existing.push(task.id);
      } else {
        successors.set(blockerId, [task.id]);
      }
    }
  }

  const projectFinish = tasks.reduce(
    (latest, task) => later(latest, task.end),
    tasks[0].end
  );

  const lateFinish = new Map<string, string>();
  const lateStart = new Map<string, string>();
  const resolving = new Set<string>();

  /**
   * The last day a task can finish without pushing anything out. Cycles are
   * broken the way the scheduler breaks them: a successor already being
   * resolved further up the stack does not constrain its own blocker, so a
   * mutually-blocking pair still gets an answer instead of hanging.
   */
  function resolve(task: CriticalPathTask): string {
    const cached = lateFinish.get(task.id);
    if (cached) return cached;

    resolving.add(task.id);

    let finish = projectFinish;
    for (const successorId of successors.get(task.id) ?? []) {
      const successor = byId.get(successorId);
      if (!successor || resolving.has(successorId)) continue;

      resolve(successor);
      const start = lateStart.get(successorId);
      if (!start) continue;
      finish = earlier(finish, dayBefore(start, skipWeekends));
    }

    resolving.delete(task.id);
    lateFinish.set(task.id, finish);
    lateStart.set(
      task.id,
      subtractDuration(
        finish,
        barLength(task.start, task.end, skipWeekends),
        skipWeekends
      )
    );
    return finish;
  }

  tasks.forEach((task) => resolve(task));

  const floatByTaskId = new Map<string, number>();
  const criticalIds = new Set<string>();

  for (const task of tasks) {
    const slack = floatDays(
      task.end,
      lateFinish.get(task.id) ?? task.end,
      skipWeekends
    );
    floatByTaskId.set(task.id, slack);
    if (slack <= 0) criticalIds.add(task.id);
  }

  // A link is critical when the blocker is pressed right up against its
  // successor: neither end has float, and the blocker's latest finish is the
  // last day before the successor has to start. Two critical tasks joined by a
  // link with room in it are both on the path, but that link is not.
  const criticalEdgeKeys = new Set<string>();
  for (const task of tasks) {
    if (!criticalIds.has(task.id)) continue;

    const start = lateStart.get(task.id);
    if (!start) continue;
    const drivingFinish = dayBefore(start, skipWeekends);

    for (const blockerId of task.incomingLinks) {
      if (blockerId === task.id || !criticalIds.has(blockerId)) continue;
      if (lateFinish.get(blockerId) !== drivingFinish) continue;
      criticalEdgeKeys.add(connectionKey(blockerId, task.id));
    }
  }

  return { criticalIds, floatByTaskId, criticalEdgeKeys, projectFinish };
}
