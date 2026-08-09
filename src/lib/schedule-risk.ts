import { TaskStatus } from "src/types/task";
import { diffDays, todayIso } from "./date-utils";

/**
 * The three ways a plan quietly goes wrong.
 *
 * A Gantt will happily draw a bar that finished last month, a task that was
 * meant to start in March and has not been touched, and an arrow pointing
 * backwards from a blocker that finishes after the work waiting on it. None of
 * those are errors the chart can fix on its own — they are decisions the user
 * has to make — but drawing them without comment means the chart looks fine
 * while the plan is not.
 *
 * Only dates the user actually wrote are judged. A suggested date is the
 * chart's own guess, and flagging your own guess as late is noise.
 */

export type ScheduleRiskKind =
  /** Finished, on paper, before today — and the task is not done. */
  | "overdue"
  /** Should have started by now and has not been picked up. */
  | "late_start"
  /** Starts before something it waits on has finished. */
  | "conflict";

export interface ScheduleRisk {
  kind: ScheduleRiskKind;
  /** The blocker finishing too late, on a conflict. */
  blockerId?: string;
}

export interface ScheduleRiskTask {
  id: string;
  /** IDs of the tasks that must finish before this one starts. */
  incomingLinks: string[];
  status: TaskStatus;
  start: string;
  end: string;
  startInferred: boolean;
  endInferred: boolean;
}

export interface ScheduleRiskOptions {
  today?: string;
}

/** Work that has stopped mattering: neither can be late. */
function isSettled(status: TaskStatus): boolean {
  return status === "done" || status === "canceled";
}

export function findScheduleRisks(
  tasks: ScheduleRiskTask[],
  options: ScheduleRiskOptions = {}
): Map<string, ScheduleRisk[]> {
  const today = options.today ?? todayIso();

  const byId = new Map<string, ScheduleRiskTask>();
  tasks.forEach((task) => byId.set(task.id, task));

  const risks = new Map<string, ScheduleRisk[]>();
  const add = (id: string, risk: ScheduleRisk) => {
    const existing = risks.get(id);
    if (existing) {
      existing.push(risk);
      return;
    }
    risks.set(id, [risk]);
  };

  for (const task of tasks) {
    if (isSettled(task.status)) continue;

    // Overdue already says the task is late, so there is nothing to add by
    // also pointing out that it started late
    if (!task.endInferred && diffDays(task.end, today) > 0) {
      add(task.id, { kind: "overdue" });
    } else if (
      task.status === "todo" &&
      !task.startInferred &&
      diffDays(task.start, today) > 0
    ) {
      add(task.id, { kind: "late_start" });
    }

    // Dates written by hand can contradict the links between tasks. An
    // inferred start never can: it was placed after its blockers to begin with.
    if (task.startInferred) continue;

    for (const blockerId of task.incomingLinks) {
      const blocker = byId.get(blockerId);
      if (!blocker || blocker.id === task.id) continue;
      if (isSettled(blocker.status)) continue;
      // The blocker has to be finished the day before, at the latest
      if (diffDays(blocker.end, task.start) > 0) continue;

      add(task.id, { kind: "conflict", blockerId });
    }
  }

  return risks;
}

/** Tasks carrying at least one risk, for a count in the footer. */
export function countTasksAtRisk(risks: Map<string, ScheduleRisk[]>): number {
  return risks.size;
}
