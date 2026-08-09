import { GanttRow } from "./gantt-rows";
import { RateBook } from "./rate-book";
import { CostIssue, CostOptions, TaskCost, computeTaskCost } from "./task-cost";
import { hasFinanceData } from "./task-finance";
import {
  addDays,
  diffDays,
  isWeekend,
  startOfMonth,
  startOfWeek,
} from "./date-utils";

/**
 * Rolling task costs up into the numbers a dashboard shows.
 *
 * Everything here returns plain numbers. Formatting them as money needs
 * `Intl.NumberFormat`, whose output varies with the platform's locale data, so
 * it stays in the components where a wobble is cosmetic rather than in the part
 * that has to be predictable under test.
 *
 * Tasks whose bar dates were only suggested are the sharp edge. Every task gets
 * a bar whether or not it has dates, so a vault of undated tasks with people on
 * them would otherwise read as a large, entirely fictional cost. They are
 * counted separately at all times so the total can always say how much of
 * itself is a guess.
 */

export type CostDimension =
  "person" | "grade" | "project" | "tag" | "status" | "file";

export type TimeBucket = "week" | "month";

export interface ReportOptions extends CostOptions {
  /** Count tasks whose dates were suggested rather than written. */
  includeInferred: boolean;
}

export interface ReportIssue {
  taskId: string;
  summary: string;
  issue: CostIssue;
}

export interface CostReport {
  /** Every row's cost, including ones left out of the totals. */
  costs: Map<string, TaskCost>;
  total: number;
  labour: number;
  materials: number;
  hours: number;
  /** Tasks that produced a number. */
  pricedTasks: number;
  /** Tasks carrying finance data that still produced nothing. */
  unpricedTasks: number;
  /** Tasks carrying no finance data at all. */
  tasksWithoutFinance: number;
  /** Cost sitting on suggested dates, whether or not it is in the total. */
  inferredTotal: number;
  inferredTaskCount: number;
  unpricedHours: number;
  unallocatedHours: number;
  issues: ReportIssue[];
}

export const EMPTY_COST_REPORT: CostReport = {
  costs: new Map(),
  total: 0,
  labour: 0,
  materials: 0,
  hours: 0,
  pricedTasks: 0,
  unpricedTasks: 0,
  tasksWithoutFinance: 0,
  inferredTotal: 0,
  inferredTaskCount: 0,
  unpricedHours: 0,
  unallocatedHours: 0,
  issues: [],
};

/** Whether a row's cost counts towards the headline totals. */
function isIncluded(row: GanttRow, options: ReportOptions): boolean {
  return options.includeInferred || !row.inferred;
}

export function buildCostReport(
  rows: GanttRow[],
  book: RateBook,
  options: ReportOptions
): CostReport {
  const report: CostReport = {
    ...EMPTY_COST_REPORT,
    costs: new Map(),
    issues: [],
  };

  for (const row of rows) {
    const cost = computeTaskCost(
      {
        taskId: row.task.id,
        finance: row.task.finance,
        start: row.bar.start,
        end: row.bar.end,
        inferred: row.inferred,
      },
      book,
      options
    );

    report.costs.set(row.task.id, cost);

    if (row.inferred) {
      report.inferredTotal += cost.total;
      report.inferredTaskCount += 1;
    }

    if (!hasFinanceData(row.task.finance)) {
      report.tasksWithoutFinance += 1;
      continue;
    }

    if (!isIncluded(row, options)) continue;

    report.total += cost.total;
    report.labour += cost.labour;
    report.materials += cost.materials;
    report.hours += cost.hours;
    report.unpricedHours += cost.unpricedHours;
    report.unallocatedHours += cost.unallocatedHours;

    if (cost.total !== 0) report.pricedTasks += 1;
    else report.unpricedTasks += 1;

    for (const issue of cost.issues) {
      report.issues.push({
        taskId: row.task.id,
        summary: row.task.summary,
        issue,
      });
    }
  }

  return report;
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

export interface CostGroup {
  /**
   * The thing being grouped by. An empty key means the cost belongs to nobody
   * in this dimension — an untagged task, or materials under "by person" —
   * and the view supplies the wording.
   */
  key: string;
  labour: number;
  materials: number;
  total: number;
  hours: number;
  taskCount: number;
}

function emptyGroup(key: string): CostGroup {
  return { key, labour: 0, materials: 0, total: 0, hours: 0, taskCount: 0 };
}

function groupFor(groups: Map<string, CostGroup>, key: string): CostGroup {
  const existing = groups.get(key);
  if (existing) return existing;

  const group = emptyGroup(key);
  groups.set(key, group);
  return group;
}

/**
 * The key a row files under, for the dimensions that describe the task rather
 * than the people on it. A task with several tags files under the first,
 * matching how the Gantt already groups rows — counting it under each would
 * make the parts add up to more than the whole.
 */
function taskKey(row: GanttRow, dimension: CostDimension): string {
  if (dimension === "status") return row.task.status;
  if (dimension === "file") return row.task.link;
  if (dimension === "project") return row.task.projects[0] ?? "";

  return (
    [...row.task.tags].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    )[0] ?? ""
  );
}

/**
 * Costs broken down along one dimension, biggest first.
 *
 * Under "by person" and "by grade" the labour splits across the people on each
 * task, and materials land in the empty key — a bag of cement belongs to a
 * task, not to anybody's timesheet, and dropping it would stop the parts adding
 * up to the total.
 */
export function groupCosts(
  report: CostReport,
  rows: GanttRow[],
  dimension: CostDimension,
  options: ReportOptions
): CostGroup[] {
  const groups = new Map<string, CostGroup>();
  const byPerson = dimension === "person" || dimension === "grade";

  for (const row of rows) {
    const cost = report.costs.get(row.task.id);
    if (!cost || !isIncluded(row, options)) continue;
    if (cost.total === 0 && cost.hours === 0) continue;

    if (!byPerson) {
      const group = groupFor(groups, taskKey(row, dimension));
      group.labour += cost.labour;
      group.materials += cost.materials;
      group.total += cost.total;
      group.hours += cost.hours;
      group.taskCount += 1;
      continue;
    }

    for (const line of cost.lines) {
      const key = dimension === "person" ? line.person : (line.grade ?? "");
      const group = groupFor(groups, key);
      group.labour += line.cost;
      group.total += line.cost;
      group.hours += line.hours;
      group.taskCount += 1;
    }

    if (cost.materials !== 0) {
      const group = groupFor(groups, "");
      group.materials += cost.materials;
      group.total += cost.materials;
    }
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/* -------------------------------------------------------------------------- */
/* Cost over time                                                             */
/* -------------------------------------------------------------------------- */

export interface CostBucket {
  /** First day of the week or month, as `YYYY-MM-DD`. */
  start: string;
  labour: number;
  materials: number;
  total: number;
}

/** A bar longer than this is almost certainly a data error, not a plan. */
const MAX_SPREAD_DAYS = 4000;

/** The days a bar's cost spreads over, skipping weekends when the Gantt does. */
function spreadDays(
  start: string,
  end: string,
  skipWeekends: boolean
): string[] {
  const span = diffDays(start, end);
  if (span < 0 || span > MAX_SPREAD_DAYS) return [start];

  const days: string[] = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(start, offset);
    if (skipWeekends && isWeekend(day)) continue;
    days.push(day);
  }

  // An entirely-weekend bar with weekends off still has to land somewhere
  return days.length > 0 ? days : [start];
}

function bucketStart(day: string, bucket: TimeBucket): string {
  return bucket === "week" ? startOfWeek(day) : startOfMonth(day);
}

function nextBucket(start: string, bucket: TimeBucket): string {
  // No addMonths in date-utils; stepping past the longest month and snapping
  // back is exact and needs no calendar table
  return bucket === "week"
    ? addDays(start, 7)
    : startOfMonth(addDays(startOfMonth(start), 32));
}

/**
 * Cost per week or month.
 *
 * A task's cost is spread evenly across the days of its bar. Real spend is
 * lumpier than that — materials usually land on one day — but nothing in the
 * data says when, and a flat spread is at least honest about being an estimate.
 * Empty buckets in the middle are kept so the chart's x-axis stays to scale.
 */
export function costOverTime(
  report: CostReport,
  rows: GanttRow[],
  bucket: TimeBucket,
  options: ReportOptions
): CostBucket[] {
  const buckets = new Map<string, CostBucket>();

  for (const row of rows) {
    const cost = report.costs.get(row.task.id);
    if (!cost || !isIncluded(row, options)) continue;
    if (cost.total === 0) continue;

    const days = spreadDays(row.bar.start, row.bar.end, options.skipWeekends);
    const labourPerDay = cost.labour / days.length;
    const materialsPerDay = cost.materials / days.length;

    for (const day of days) {
      const key = bucketStart(day, bucket);
      const entry = buckets.get(key) ?? {
        start: key,
        labour: 0,
        materials: 0,
        total: 0,
      };

      entry.labour += labourPerDay;
      entry.materials += materialsPerDay;
      entry.total += labourPerDay + materialsPerDay;
      buckets.set(key, entry);
    }
  }

  if (buckets.size === 0) return [];

  const keys = [...buckets.keys()].sort();
  const filled: CostBucket[] = [];

  let cursor = keys[0];
  const last = keys[keys.length - 1];

  while (diffDays(cursor, last) >= 0 && filled.length <= MAX_SPREAD_DAYS) {
    filled.push(
      buckets.get(cursor) ?? {
        start: cursor,
        labour: 0,
        materials: 0,
        total: 0,
      }
    );
    cursor = nextBucket(cursor, bucket);
  }

  return filled;
}

/** The tasks carrying the most cost, biggest first. */
export function topCostDrivers(
  report: CostReport,
  rows: GanttRow[],
  limit: number,
  options: ReportOptions
): Array<{ row: GanttRow; cost: TaskCost }> {
  return rows
    .map((row) => ({ row, cost: report.costs.get(row.task.id) }))
    .filter(
      (entry): entry is { row: GanttRow; cost: TaskCost } =>
        entry.cost !== undefined &&
        entry.cost.total !== 0 &&
        isIncluded(entry.row, options)
    )
    .sort((a, b) => b.cost.total - a.cost.total)
    .slice(0, Math.max(0, limit));
}
