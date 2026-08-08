import { barLength } from "./gantt-schedule";
import { TaskFinance } from "./task-finance";
import { RateBook, resolveRate } from "./rate-book";

/**
 * What one task costs.
 *
 * Hours come from the task if it names a total, and otherwise from its length
 * on the timeline at some number of hours a day. The length is `barLength`, the
 * same number the Gantt draws from, so the money and the chart can never
 * disagree about how long something takes — including whether weekends count.
 *
 * Missing data is reported, never invented. An unknown person costs nothing and
 * says so; shares that do not add up to 100% are used exactly as written. The
 * temptation is to scale 60% + 30% up to 100% and move on, but that hides a
 * typo and quietly inflates the plan. Better to show the total and let someone
 * decide whether it was meant.
 */

export type HoursSource = "explicit" | "per-day";

export type CostIssue =
  | { kind: "no-allocations" }
  | { kind: "unknown-person"; person: string }
  | { kind: "no-rate"; person: string; grade: string | null }
  | { kind: "allocations-off"; total: number }
  | { kind: "inferred-schedule" };

export interface PersonCostLine {
  person: string;
  grade: string | null;
  share: number;
  hours: number;
  /** Null when nobody could say what this person's time costs. */
  rate: number | null;
  cost: number;
}

export interface TaskCost {
  taskId: string;
  /** Length of the bar, in whichever kind of day the Gantt is counting. */
  days: number;
  hours: number;
  hoursSource: HoursSource;
  lines: PersonCostLine[];
  labour: number;
  materials: number;
  total: number;
  /** Hours worked by someone with no resolvable rate. */
  unpricedHours: number;
  /** Hours nobody is on, i.e. the shortfall when shares total under 100%. */
  unallocatedHours: number;
  inferred: boolean;
  issues: CostIssue[];
}

export interface CostOptions {
  defaultHoursPerDay: number;
  skipWeekends: boolean;
}

export interface TaskCostInput {
  taskId: string;
  finance: TaskFinance;
  start: string;
  end: string;
  /** True when the bar's dates were suggested rather than read off the task. */
  inferred: boolean;
}

/** Shares this far off 100% are treated as rounding, not as a mistake. */
const SHARE_TOLERANCE = 0.005;

/**
 * The hours a task takes. An explicit total wins outright; otherwise it is the
 * bar's length at the task's own hours-per-day, or the global default.
 *
 * Zero is honoured throughout — a zero-hour placeholder is a real thing to want
 * — so only a missing value falls back.
 */
export function resolveTaskHours(
  finance: TaskFinance,
  days: number,
  defaultHoursPerDay: number
): { hours: number; source: HoursSource } {
  if (finance.totalHours !== null) {
    return { hours: finance.totalHours, source: "explicit" };
  }

  const perDay = finance.hoursPerDay ?? defaultHoursPerDay;
  return { hours: perDay * days, source: "per-day" };
}

export function computeTaskCost(
  input: TaskCostInput,
  book: RateBook,
  options: CostOptions
): TaskCost {
  const { finance } = input;
  const days = barLength(input.start, input.end, options.skipWeekends);
  const { hours, source } = resolveTaskHours(
    finance,
    days,
    options.defaultHoursPerDay
  );

  const issues: CostIssue[] = [];
  const lines: PersonCostLine[] = [];

  let labour = 0;
  let unpricedHours = 0;
  let allocatedShare = 0;

  for (const allocation of finance.allocations) {
    const resolution = resolveRate(book, allocation.person);
    const personHours = hours * allocation.share;
    const cost = resolution.rate === null ? 0 : personHours * resolution.rate;

    allocatedShare += allocation.share;
    labour += cost;

    if (resolution.rate === null) {
      unpricedHours += personHours;
      // Two different problems: nobody by that name, or a name with no rate
      // behind it. Telling them apart is the difference between a typo and an
      // unfinished rates note.
      issues.push(
        resolution.grade === null
          ? { kind: "unknown-person", person: allocation.person }
          : {
              kind: "no-rate",
              person: allocation.person,
              grade: resolution.grade,
            }
      );
    }

    lines.push({
      person: allocation.person,
      grade: resolution.grade,
      share: allocation.share,
      hours: personHours,
      rate: resolution.rate,
      cost,
    });
  }

  if (finance.allocations.length === 0) {
    issues.push({ kind: "no-allocations" });
  } else if (Math.abs(allocatedShare - 1) > SHARE_TOLERANCE) {
    issues.push({ kind: "allocations-off", total: allocatedShare });
  }

  if (input.inferred) {
    issues.push({ kind: "inferred-schedule" });
  }

  // Only ever a shortfall: shares over 100% mean two people at once, which is
  // real work, not spare capacity
  const unallocatedHours = Math.max(0, hours - hours * allocatedShare);

  const materials = finance.expenses.reduce(
    (sum, expense) => sum + expense.amount,
    0
  );

  return {
    taskId: input.taskId,
    days,
    hours,
    hoursSource: source,
    lines,
    labour,
    materials,
    total: labour + materials,
    unpricedHours,
    unallocatedHours,
    inferred: input.inferred,
    issues,
  };
}
