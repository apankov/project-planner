import { BaseTask } from "src/types/base-task";
import { findTaskDate } from "./task-dates";
import {
  GanttTaskInput,
  ScheduledBar,
  scheduleTasks,
  isInferredBar,
} from "./gantt-schedule";

export interface GanttRow {
  task: BaseTask;
  bar: ScheduledBar;
  /** True when both endpoints were inferred rather than read from the task. */
  inferred: boolean;
}

export interface GanttDependency {
  /** Task that must finish first. */
  fromId: string;
  toId: string;
  fromRow: number;
  toRow: number;
}

export interface BuildRowsOptions {
  today?: string;
  defaultDurationDays?: number;
}

/**
 * A task's own dates. `start` falls back to `scheduled`, which is how people
 * who never use 🛫 still get a meaningful bar start.
 */
export function toScheduleInput(task: BaseTask): GanttTaskInput {
  return {
    id: task.id,
    incomingLinks: task.incomingLinks,
    start:
      findTaskDate(task.dates, "start") ??
      findTaskDate(task.dates, "scheduled"),
    due: findTaskDate(task.dates, "due"),
    done: findTaskDate(task.dates, "done"),
  };
}

/**
 * Schedules the tasks, keeping them in the order they were given.
 *
 * Row order is the user's to decide — see `gantt-order` — so this
 * deliberately does not sort. Sorting by date is an action they trigger.
 */
export function buildGanttRows(
  tasks: BaseTask[],
  options: BuildRowsOptions = {}
): GanttRow[] {
  const bars = scheduleTasks(tasks.map(toScheduleInput), options);

  const rows: GanttRow[] = [];
  for (const task of tasks) {
    const bar = bars.get(task.id);
    if (!bar) continue;
    rows.push({ task, bar, inferred: isInferredBar(bar) });
  }

  return rows;
}

/**
 * Dependency links between visible rows, as row indices so the arrow layer can
 * draw without another lookup. Links to filtered-out tasks are dropped.
 */
export function getDependencies(rows: GanttRow[]): GanttDependency[] {
  const rowIndexById = new Map<string, number>();
  rows.forEach((row, index) => rowIndexById.set(row.task.id, index));

  const dependencies: GanttDependency[] = [];

  rows.forEach((row, toRow) => {
    for (const fromId of row.task.incomingLinks) {
      const fromRow = rowIndexById.get(fromId);
      if (fromRow === undefined || fromRow === toRow) continue;
      dependencies.push({ fromId, toId: row.task.id, fromRow, toRow });
    }
  });

  return dependencies;
}

/** Rows whose dates are only proposals, i.e. what "apply dates" would write. */
export function getInferredRows(rows: GanttRow[]): GanttRow[] {
  return rows.filter((row) => row.inferred);
}
