import { addDays, diffDays, toEpochDay, todayIso } from "./date-utils";

/**
 * Turning tasks into timeline bars.
 *
 * Most tasks in a real vault have no dates at all, so a Gantt that only drew
 * dated tasks would be nearly empty. Every task therefore gets a bar: explicit
 * dates are used as-is, and anything missing is inferred from the task's
 * position in the dependency graph — a task starts the day after the last of
 * its blockers finishes, and lasts one day by default.
 *
 * Inference never touches the vault. A bar keeps `startInferred` /
 * `endInferred` flags so the view can render it as a proposal until the user
 * drags it or applies the inferred dates explicitly.
 */

export const DEFAULT_DURATION_DAYS = 1;

export interface GanttTaskInput {
  id: string;
  /** IDs of tasks that block this one; they must finish first. */
  incomingLinks: string[];
  start?: string | null;
  due?: string | null;
  /** Completion date, used as the bar end for finished work. */
  done?: string | null;
}

export interface ScheduledBar {
  id: string;
  start: string;
  end: string;
  startInferred: boolean;
  endInferred: boolean;
}

export interface ScheduleOptions {
  /** Anchor for tasks with neither dates nor dated blockers. */
  today?: string;
  defaultDurationDays?: number;
}

/** A bar is a proposal only when neither endpoint came from the task itself. */
export function isInferredBar(bar: ScheduledBar): boolean {
  return bar.startInferred && bar.endInferred;
}

function normalizeDate(value: string | null | undefined): string | null {
  return toEpochDay(value) === null ? null : (value as string);
}

/**
 * Schedules every task, resolving blockers first.
 *
 * Cycles are broken by ignoring the edge that closes them: a task already
 * being resolved higher up the stack does not constrain its own blocker, so a
 * mutually-blocking pair still gets bars instead of hanging.
 */
export function scheduleTasks(
  tasks: GanttTaskInput[],
  options: ScheduleOptions = {}
): Map<string, ScheduledBar> {
  const today = normalizeDate(options.today) ?? todayIso();
  const duration = Math.max(
    1,
    options.defaultDurationDays ?? DEFAULT_DURATION_DAYS
  );

  const byId = new Map<string, GanttTaskInput>();
  tasks.forEach((task) => byId.set(task.id, task));

  const resolved = new Map<string, ScheduledBar>();
  const resolving = new Set<string>();

  function resolve(task: GanttTaskInput): ScheduledBar {
    const cached = resolved.get(task.id);
    if (cached) return cached;

    resolving.add(task.id);

    // The day work could start: the day after every blocker has finished
    let earliestStart: string | null = null;
    for (const blockerId of task.incomingLinks) {
      const blocker = byId.get(blockerId);
      if (!blocker || resolving.has(blockerId)) continue;

      const blockerBar = resolve(blocker);
      const candidate = addDays(blockerBar.end, 1);
      if (!earliestStart || diffDays(earliestStart, candidate) > 0) {
        earliestStart = candidate;
      }
    }

    const explicitStart = normalizeDate(task.start);
    const explicitEnd = normalizeDate(task.due) ?? normalizeDate(task.done);

    const bar = layOutBar({
      explicitStart,
      explicitEnd,
      earliestStart,
      fallbackStart: today,
      duration,
      id: task.id,
    });

    resolving.delete(task.id);
    resolved.set(task.id, bar);
    return bar;
  }

  tasks.forEach((task) => resolve(task));

  return resolved;
}

function layOutBar({
  id,
  explicitStart,
  explicitEnd,
  earliestStart,
  fallbackStart,
  duration,
}: {
  id: string;
  explicitStart: string | null;
  explicitEnd: string | null;
  earliestStart: string | null;
  fallbackStart: string;
  duration: number;
}): ScheduledBar {
  // Both dates given: honour them, collapsing an end that precedes the start
  if (explicitStart && explicitEnd) {
    const end =
      diffDays(explicitStart, explicitEnd) < 0 ? explicitStart : explicitEnd;
    return {
      id,
      start: explicitStart,
      end,
      startInferred: false,
      endInferred: false,
    };
  }

  // Start only: run for the default duration
  if (explicitStart) {
    return {
      id,
      start: explicitStart,
      end: addDays(explicitStart, duration - 1),
      startInferred: false,
      endInferred: true,
    };
  }

  // End only: show the window from when work could begin up to the deadline,
  // falling back to a default-length bar finishing on the due date
  if (explicitEnd) {
    const windowStart =
      earliestStart && diffDays(earliestStart, explicitEnd) >= 0
        ? earliestStart
        : addDays(explicitEnd, -(duration - 1));
    return {
      id,
      start: windowStart,
      end: explicitEnd,
      startInferred: true,
      endInferred: false,
    };
  }

  // Nothing given: flow on from the blockers, or sit at today
  const start = earliestStart ?? fallbackStart;
  return {
    id,
    start,
    end: addDays(start, duration - 1),
    startInferred: true,
    endInferred: true,
  };
}

/** Inclusive span covering every bar, padded so the chart never starts flush. */
export function getTimelineRange(
  bars: ScheduledBar[],
  options: { today?: string; padDays?: number } = {}
): { start: string; end: string } {
  const today = normalizeDate(options.today) ?? todayIso();
  const pad = options.padDays ?? 3;

  if (bars.length === 0) {
    return { start: addDays(today, -pad), end: addDays(today, pad) };
  }

  let min = bars[0].start;
  let max = bars[0].end;

  for (const bar of bars) {
    if (diffDays(min, bar.start) < 0) min = bar.start;
    if (diffDays(max, bar.end) > 0) max = bar.end;
  }

  // Keep today in view so the marker is never off-screen
  if (diffDays(min, today) < 0) min = today;
  if (diffDays(max, today) > 0) max = today;

  return { start: addDays(min, -pad), end: addDays(max, pad) };
}

/** Moves a bar by whole days, keeping its length. */
export function shiftBar(
  bar: { start: string; end: string },
  days: number
): { start: string; end: string } {
  if (days === 0) return { start: bar.start, end: bar.end };
  return { start: addDays(bar.start, days), end: addDays(bar.end, days) };
}

/** Drags one edge, never letting a bar collapse below a single day. */
export function resizeBar(
  bar: { start: string; end: string },
  edge: "start" | "end",
  days: number
): { start: string; end: string } {
  if (days === 0) return { start: bar.start, end: bar.end };

  if (edge === "start") {
    const start = addDays(bar.start, days);
    return {
      start: diffDays(start, bar.end) < 0 ? bar.end : start,
      end: bar.end,
    };
  }

  const end = addDays(bar.end, days);
  return {
    start: bar.start,
    end: diffDays(bar.start, end) < 0 ? bar.start : end,
  };
}
