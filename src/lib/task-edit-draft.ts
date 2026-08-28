/**
 * What the task editor holds, and everything that can be worked out from it.
 *
 * There is one editor now, reachable from the timeline, the board, the map and
 * the finance view, so there is one draft: the whole of what a task is, rather
 * than the four fields the Gantt happened to show or the costing the finance
 * modal happened to own. The form collects this and hands it back; nothing here
 * touches the vault.
 *
 * Keeping the arithmetic out of the component is what makes it testable — the
 * per-person hours and costs are the part that is easy to get subtly wrong, and
 * they are the reason the running totals in the dialog are worth having at all.
 */

import { BaseTask } from "src/types/base-task";
import { TaskStatus } from "src/types/task";
import { barLength } from "./gantt-schedule";
import { toEpochDay } from "./date-utils";
import { findTaskDate } from "./task-dates";
import {
  TaskAllocation,
  TaskExpense,
  TaskFinance,
  hasFinanceData,
} from "./task-finance";
import { RateBook, resolveRate } from "./rate-book";
import { resolveTaskHours } from "./task-cost";
import { taskTextDescription } from "./task-text";

/** Everything the editor can change about a task. */
export interface TaskEditDraft {
  /** The words on the task line, with its metadata already taken off. */
  text: string;
  status: TaskStatus;
  /** `null` clears the date. */
  start: string | null;
  due: string | null;
  /** Whole percent, or `null` for a task carrying no progress at all. */
  progress: number | null;
  /** The one person answerable for the task. */
  owner: string | null;
  /** Who does the work, and in what proportion. */
  allocations: TaskAllocation[];
  expenses: TaskExpense[];
  hoursPerDay: number | null;
  totalHours: number | null;
  /** The task this one sits inside, by id. */
  parentId: string | null;
  /** The tasks this one waits on, by id. */
  dependsOn: string[];
  tags: string[];
}

/** What the editor needs to know to price a draft. */
export interface DraftCostOptions {
  book: RateBook;
  defaultHoursPerDay: number;
  skipWeekends: boolean;
}

/** One contributor row, with the numbers the dialog shows beside it. */
export interface ContributorLine {
  person: string;
  share: number;
  hours: number;
  /** Null when nobody could say what this person's time costs. */
  rate: number | null;
  cost: number;
}

/* -------------------------------------------------------------------------- */

/** The finance half of a draft, as the rest of the plugin holds it. */
export function financeFromDraft(draft: TaskEditDraft): TaskFinance {
  return {
    hoursPerDay: draft.hoursPerDay,
    totalHours: draft.totalHours,
    allocations: draft.allocations.filter((entry) => entry.person.trim()),
    expenses: draft.expenses.filter((entry) => entry.description.trim()),
  };
}

/** The draft a task starts the dialog with. */
export function draftFromTask(task: BaseTask): TaskEditDraft {
  return {
    text: taskTextDescription(task.text),
    status: task.status,
    start: findTaskDate(task.dates, "start"),
    due: findTaskDate(task.dates, "due"),
    progress: task.progress.percent,
    owner: task.owner,
    allocations: task.finance.allocations.map((entry) => ({ ...entry })),
    expenses: task.finance.expenses.map((entry) => ({ ...entry })),
    hoursPerDay: task.finance.hoursPerDay,
    totalHours: task.finance.totalHours,
    parentId: task.parentId,
    dependsOn: [...task.incomingLinks],
    tags: [...task.tags],
  };
}

/**
 * How long the task runs, in whichever kind of day the Gantt is counting.
 *
 * Zero when either end is missing, which is honest rather than convenient: a
 * task with no dates has no length, and the hours it would imply at so many a
 * day are not a number anybody should be shown.
 */
export function draftDays(draft: TaskEditDraft, skipWeekends: boolean): number {
  if (!draft.start || !draft.due) return 0;
  return barLength(draft.start, draft.due, skipWeekends);
}

/** The hours the draft comes to, and whether they were stated or worked out. */
export function draftHours(
  draft: TaskEditDraft,
  options: DraftCostOptions
): { hours: number; source: "explicit" | "per-day" } {
  return resolveTaskHours(
    financeFromDraft(draft),
    draftDays(draft, options.skipWeekends),
    options.defaultHoursPerDay
  );
}

/**
 * The contributor rows with their hours and costs filled in.
 *
 * Shares are used exactly as written. The temptation is to scale 60% + 30% up
 * to 100%, but that hides a typo and quietly inflates the plan — the dialog
 * shows the total instead and lets the user decide whether they meant it.
 */
export function contributorLines(
  draft: TaskEditDraft,
  options: DraftCostOptions
): ContributorLine[] {
  const { hours } = draftHours(draft, options);

  return draft.allocations.map((allocation) => {
    const personHours = hours * allocation.share;
    const { rate } = resolveRate(options.book, allocation.person);

    return {
      person: allocation.person,
      share: allocation.share,
      hours: personHours,
      rate,
      cost: rate === null ? 0 : personHours * rate,
    };
  });
}

/** The shares added up. 1 is a full task; anything else is worth flagging. */
export function totalShare(draft: TaskEditDraft): number {
  return draft.allocations.reduce((sum, entry) => sum + entry.share, 0);
}

/** Shares this far off 100% are rounding, not a mistake. */
const SHARE_TOLERANCE = 0.005;

/** Whether the shares are far enough off 100% to be worth saying so. */
export function sharesLookWrong(draft: TaskEditDraft): boolean {
  if (draft.allocations.length === 0) return false;
  return Math.abs(totalShare(draft) - 1) > SHARE_TOLERANCE;
}

/** What the draft costs, split the way the dialog shows it. */
export function draftTotals(
  draft: TaskEditDraft,
  options: DraftCostOptions
): { labour: number; materials: number; total: number } {
  const labour = contributorLines(draft, options).reduce(
    (sum, line) => sum + line.cost,
    0
  );
  const materials = draft.expenses.reduce((sum, item) => sum + item.amount, 0);

  return { labour, materials, total: labour + materials };
}

/* -------------------------------------------------------------------------- */

/** Why a draft cannot be saved, or null when it can. */
export type DraftProblem = "text-required" | "date-invalid" | "dates-backwards";

/**
 * Checks a draft over before it is written.
 *
 * Only the three things that would produce a task the plugin cannot draw. A
 * share that does not total 100%, an owner who is not in the rate book, a task
 * with no dates at all — those are all legitimate states to save something in,
 * and the dialog says so beside the field rather than refusing the save.
 */
export function validateDraft(
  draft: TaskEditDraft,
  options: { canEditText: boolean }
): DraftProblem | null {
  if (options.canEditText && !draft.text.trim()) return "text-required";

  for (const date of [draft.start, draft.due]) {
    if (date && toEpochDay(date) === null) return "date-invalid";
  }

  if (draft.start && draft.due) {
    const start = toEpochDay(draft.start);
    const due = toEpochDay(draft.due);
    if (start !== null && due !== null && due < start) return "dates-backwards";
  }

  return null;
}

/* -------------------------------------------------------------------------- */

function allocationsEqual(a: TaskAllocation[], b: TaskAllocation[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.person === b[index].person && entry.share === b[index].share
    )
  );
}

function expensesEqual(a: TaskExpense[], b: TaskExpense[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.description === b[index].description &&
        entry.amount === b[index].amount
    )
  );
}

function listsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

/**
 * Whether a draft asks for any change at all.
 *
 * A dialog opened and closed again is not an edit, and does not belong on the
 * undo stack in front of whatever the user actually did.
 */
export function draftChanged(
  draft: TaskEditDraft,
  previous: TaskEditDraft
): boolean {
  return (
    draft.text !== previous.text ||
    draft.status !== previous.status ||
    draft.start !== previous.start ||
    draft.due !== previous.due ||
    draft.progress !== previous.progress ||
    draft.owner !== previous.owner ||
    draft.hoursPerDay !== previous.hoursPerDay ||
    draft.totalHours !== previous.totalHours ||
    draft.parentId !== previous.parentId ||
    !allocationsEqual(draft.allocations, previous.allocations) ||
    !expensesEqual(draft.expenses, previous.expenses) ||
    !listsEqual(draft.dependsOn, previous.dependsOn) ||
    !listsEqual(draft.tags, previous.tags)
  );
}

/** Whether the draft's costing half changed, i.e. whether to write finance. */
export function financeChanged(
  draft: TaskEditDraft,
  previous: TaskEditDraft
): boolean {
  return (
    draft.hoursPerDay !== previous.hoursPerDay ||
    draft.totalHours !== previous.totalHours ||
    !allocationsEqual(draft.allocations, previous.allocations) ||
    !expensesEqual(draft.expenses, previous.expenses)
  );
}

/** Whether the draft carries any costing at all. */
export function draftHasFinance(draft: TaskEditDraft): boolean {
  return hasFinanceData(financeFromDraft(draft));
}
