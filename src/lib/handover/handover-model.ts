/**
 * The handover pack, reduced to the facts a document has to state.
 *
 * Everything the views know is spread across a dozen modules and half of it is
 * only meaningful while you can click on it. This turns that into the flat,
 * finished shapes a page can be written from: a row per task with its
 * dependencies already resolved to names, a summary that has already done its
 * counting, and a finance section that has already been rolled up.
 *
 * The point of doing it here rather than in the writer is that the *contents*
 * of a handover — what counts as overdue, what a task's dependencies are once
 * the filtered-out ones are dropped, which day the project finishes — are
 * decisions worth testing, and none of them need a DOM to make.
 *
 * The one thing this module deliberately does not hold is note prose. Rendering
 * Markdown needs Obsidian's renderer and therefore a DOM, so notes arrive
 * already rendered from the component layer and are only carried here.
 */

import { TaskStatus } from "../../types/task";
import { CriticalPath } from "../critical-path";
import { GanttRow } from "../gantt-rows";
import { GanttMilestone } from "../gantt-milestones";
import { OpenQuestion } from "../open-question";
import { CostGroup, CostReport } from "../finance-summary";
import { CostIssue, TaskCost } from "../task-cost";
import { plainTaskText } from "../task-text";
import { diffDays } from "../date-utils";

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export interface HandoverTaskRow {
  id: string;
  summary: string;
  status: TaskStatus;
  priority: string;
  owner: string | null;
  start: string;
  end: string;
  /** Dates the chart proposed rather than read from the note. */
  inferred: boolean;
  percent: number | null;
  /** IDs of tasks that must finish first, kept only where they resolve. */
  dependsOn: string[];
  /** IDs of tasks waiting on this one. */
  blocks: string[];
  critical: boolean;
  /** Days it can slip before the finish date moves, when it is known. */
  floatDays: number | null;
  tags: string[];
  projects: string[];
  /** The note the task lives in, for the cross-reference to the appendix. */
  notePath: string;
  /** Indent level in the task hierarchy; 0 for a top-level task. */
  depth: number;
  hours: number | null;
  cost: number | null;
  /** Unfinished, with an end date already behind us. */
  overdue: boolean;
}

export interface BuildTaskRowsInput {
  rows: GanttRow[];
  /** Indent per task ID, from the hierarchy the Gantt already worked out. */
  depthById: Map<string, number>;
  critical: CriticalPath;
  /** Absent when finance is switched off. */
  costs: Map<string, TaskCost> | null;
  today: string;
}

/** Whether a task is still work: the two statuses that can go overdue. */
function isOpen(status: TaskStatus): boolean {
  return status !== "done" && status !== "canceled";
}

/**
 * The task register, in the order the rows were given.
 *
 * Order is the chart's to decide — grouping, manual order and date order are
 * all choices the user has already made — so this never sorts. It only fills
 * in what a reader of a document needs and a reader of a screen can hover for.
 */
export function buildTaskRows(input: BuildTaskRowsInput): HandoverTaskRow[] {
  const { rows, depthById, critical, costs, today } = input;

  const present = new Set(rows.map((row) => row.task.id));

  // Who is waiting on whom, built once rather than re-scanned per row
  const blocks = new Map<string, string[]>();
  for (const row of rows) {
    for (const blockerId of row.task.incomingLinks) {
      if (!present.has(blockerId) || blockerId === row.task.id) continue;
      const existing = blocks.get(blockerId);
      if (existing) existing.push(row.task.id);
      else blocks.set(blockerId, [row.task.id]);
    }
  }

  return rows.map((row) => {
    const { task } = row;
    const cost = costs?.get(task.id) ?? null;
    const float = critical.floatByTaskId.get(task.id);

    return {
      id: task.id,
      // A task whose text is a wikilink reads as "[[Redesign Float Section]]"
      // raw. On screen the label column renders it as a real link and nobody
      // sees the brackets; on paper there is nothing to click, so showing the
      // markup would hand the reader a page of Obsidian syntax they have no
      // reason to know
      summary: plainTaskText(task.summary),
      status: task.status,
      priority: task.priority,
      owner: task.owner,
      start: row.bar.start,
      end: row.bar.end,
      inferred: row.inferred,
      percent: task.progress.percent,
      dependsOn: task.incomingLinks.filter(
        (id) => present.has(id) && id !== task.id
      ),
      blocks: blocks.get(task.id) ?? [],
      critical: critical.criticalIds.has(task.id),
      floatDays: float ?? null,
      tags: task.tags,
      projects: task.projects,
      notePath: task.link,
      depth: depthById.get(task.id) ?? 0,
      hours: cost ? cost.hours : null,
      cost: cost ? cost.total : null,
      overdue: isOpen(task.status) && diffDays(row.bar.end, today) > 0,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* The summary                                                                */
/* -------------------------------------------------------------------------- */

export interface HandoverStatusCount {
  status: TaskStatus;
  count: number;
}

export interface HandoverSummary {
  taskCount: number;
  statusCounts: HandoverStatusCount[];
  /** The first day any task starts, or null when there are no tasks. */
  start: string | null;
  /** The last day any task finishes. */
  finish: string | null;
  criticalCount: number;
  /** Tasks whose dates the plugin guessed. The reader must be told. */
  inferredCount: number;
  overdueCount: number;
  unownedCount: number;
  milestoneCount: number;
  openQuestionCount: number;
  answeredQuestionCount: number;
  noteCount: number;
}

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "canceled"];

export interface BuildSummaryInput {
  tasks: HandoverTaskRow[];
  milestones: GanttMilestone[];
  questions: OpenQuestion[];
  noteCount: number;
}

export function buildSummary(input: BuildSummaryInput): HandoverSummary {
  const { tasks, milestones, questions, noteCount } = input;

  const counts = new Map<TaskStatus, number>();
  let start: string | null = null;
  let finish: string | null = null;

  for (const task of tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1);

    if (start === null || diffDays(start, task.start) < 0) start = task.start;
    if (finish === null || diffDays(finish, task.end) > 0) finish = task.end;
  }

  return {
    taskCount: tasks.length,
    statusCounts: STATUS_ORDER.filter((status) => counts.has(status)).map(
      (status) => ({ status, count: counts.get(status) ?? 0 })
    ),
    start,
    finish,
    criticalCount: tasks.filter((task) => task.critical).length,
    inferredCount: tasks.filter((task) => task.inferred).length,
    overdueCount: tasks.filter((task) => task.overdue).length,
    unownedCount: tasks.filter((task) => !task.owner).length,
    milestoneCount: milestones.length,
    openQuestionCount: questions.filter((question) => !question.resolved)
      .length,
    answeredQuestionCount: questions.filter((question) => question.resolved)
      .length,
    noteCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

export interface HandoverCostDriver {
  id: string;
  summary: string;
  total: number;
  hours: number;
}

export interface HandoverFinance {
  currency: string;
  total: number;
  labour: number;
  materials: number;
  hours: number;
  pricedTasks: number;
  unpricedTasks: number;
  tasksWithoutFinance: number;
  /** How much of the total is sitting on dates the plugin guessed. */
  inferredTotal: number;
  inferredTaskCount: number;
  includeInferred: boolean;
  byPerson: CostGroup[];
  byProject: CostGroup[];
  drivers: HandoverCostDriver[];
  issues: Array<{ taskId: string; summary: string; issue: string }>;
}

export interface BuildFinanceInput {
  report: CostReport;
  byPerson: CostGroup[];
  byProject: CostGroup[];
  tasks: HandoverTaskRow[];
  currency: string;
  includeInferred: boolean;
  /** How many cost drivers to name. The rest are in the register anyway. */
  driverLimit: number;
  /** Turns a costing problem into the sentence the document prints. */
  describeIssue: (_issue: CostIssue) => string;
}

/**
 * The finance section.
 *
 * Costs come in already computed, because the rate book has to be read from the
 * vault and that is not this module's business. What is this module's business
 * is that the caveats travel with the numbers: a total that is partly guessed
 * has to say so on the same page, not in a footnote nobody reaches.
 */
export function buildFinance(input: BuildFinanceInput): HandoverFinance {
  const { report, tasks, driverLimit } = input;

  const byId = new Map(tasks.map((task) => [task.id, task]));

  const drivers = tasks
    .filter((task) => task.cost !== null && task.cost !== 0)
    .sort((left, right) => (right.cost ?? 0) - (left.cost ?? 0))
    .slice(0, Math.max(0, driverLimit))
    .map((task) => ({
      id: task.id,
      summary: task.summary,
      total: task.cost ?? 0,
      hours: task.hours ?? 0,
    }));

  return {
    currency: input.currency,
    total: report.total,
    labour: report.labour,
    materials: report.materials,
    hours: report.hours,
    pricedTasks: report.pricedTasks,
    unpricedTasks: report.unpricedTasks,
    tasksWithoutFinance: report.tasksWithoutFinance,
    inferredTotal: report.inferredTotal,
    inferredTaskCount: report.inferredTaskCount,
    includeInferred: input.includeInferred,
    byPerson: input.byPerson,
    byProject: input.byProject,
    drivers,
    issues: report.issues.map((entry) => ({
      taskId: entry.taskId,
      summary: byId.get(entry.taskId)?.summary ?? entry.summary,
      issue: input.describeIssue(entry.issue),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export interface HandoverNote {
  path: string;
  /** The file name without folders or extension. */
  title: string;
  /** The folder it sits in, or "" at the vault root. */
  folder: string;
  /** Already-rendered HTML. See the note at the top of this file. */
  html: string;
  /** Where the document links to it. */
  anchor: string;
}

/**
 * A stable in-document anchor for a note path.
 *
 * It has to survive being put in an `href`, and two different notes must never
 * land on the same one — hence the hash tail rather than the slug alone.
 * `Projects/Q3 plan.md` and `Archive/Q3 plan.md` are different notes and a
 * cross-reference that quietly picked the wrong one would be worse than no
 * cross-reference at all.
 */
export function noteAnchor(path: string): string {
  const slug = path
    .replace(/\.md$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  let hash = 0;
  for (let index = 0; index < path.length; index += 1) {
    hash = (hash * 31 + path.charCodeAt(index)) | 0;
  }

  return `note-${slug || "untitled"}-${(hash >>> 0).toString(36)}`;
}

/** The anchor a task's row is given, so a note can point back at it. */
export function taskAnchor(id: string): string {
  return `task-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** Notes in the order a reader walks a vault: by folder, then by name. */
export function sortNotes(notes: HandoverNote[]): HandoverNote[] {
  return [...notes].sort((left, right) => {
    if (left.folder !== right.folder) {
      return left.folder.localeCompare(right.folder, undefined, {
        sensitivity: "base",
      });
    }
    return left.title.localeCompare(right.title, undefined, {
      sensitivity: "base",
    });
  });
}

/* -------------------------------------------------------------------------- */
/* The whole pack                                                             */
/* -------------------------------------------------------------------------- */

export interface HandoverMilestone {
  label: string;
  date: string;
  /** Already past on the day the pack was made. */
  past: boolean;
}

export interface HandoverQuestion {
  question: string;
  answer: string | null;
  resolved: boolean;
  resolvedOn: string | null;
  noteName: string;
  notePath: string;
  /** The appendix entry for the note that raised it, when it is in the pack. */
  noteAnchor: string | null;
}

export interface HandoverPack {
  title: string;
  vaultName: string;
  /** The day the pack was made, as `YYYY-MM-DD`. */
  generatedOn: string;
  summary: HandoverSummary;
  /** The Gantt chart, as a self-contained SVG document. */
  ganttSvg: string | null;
  graphs: Array<{ svg: string; nodeCount: number }>;
  /** Tasks in no chain at all, named rather than drawn. */
  isolatedTaskIds: string[];
  tasks: HandoverTaskRow[];
  milestones: HandoverMilestone[];
  finance: HandoverFinance | null;
  questions: HandoverQuestion[];
  notes: HandoverNote[];
}
