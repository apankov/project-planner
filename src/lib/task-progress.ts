/**
 * Reading and writing the progress metadata on a task.
 *
 * Progress is how much of a task is finished, written as a whole percentage.
 * Inline tasks carry it as a Dataview field on the task line
 * (`[progress:: 40]`, or `[progress:: 40%]` for people who like the unit);
 * note-based tasks carry it as a `progress:` frontmatter key. Both end up as
 * one `TaskProgress` so the rest of the plugin does not care where it came
 * from.
 *
 * Progress and status stay separate on disk, but one reading is derived from
 * the other for display: a task somebody has put work into is underway
 * whatever its checkbox still says, so any percentage above zero shows as in
 * progress. See `effectiveTaskStatus` for what that does and does not cover —
 * in particular, 100% is still not promoted to done, because finishing the
 * work and declaring the task closed are different claims and only the second
 * is the user's to make.
 *
 * Out-of-range values are clamped rather than rejected. Someone who typed 120
 * meant "finished", not "throw"; dropping the field would lose that entirely.
 */

import { TaskStatus } from "../types/task";
import {
  PROGRESS_FIELD_NAMES,
  PROGRESS_FIELD_PATTERN,
  PROGRESS_FIELD_REMOVAL,
  PROGRESS_VALUE_PATTERN,
} from "./task-regex";

export interface TaskProgress {
  /** Whole percent, 0–100. Null when the task carries no progress at all. */
  percent: number | null;
}

export const EMPTY_TASK_PROGRESS: TaskProgress = { percent: null };

/** The ends of the scale. A percentage is never allowed outside these. */
export const MIN_PROGRESS = 0;
export const MAX_PROGRESS = 100;

/** Every accepted spelling, canonical first. */
const PROGRESS_FIELDS = PROGRESS_FIELD_NAMES.split("|");

/** The field name written back to the vault. */
const CANONICAL_FIELD = PROGRESS_FIELDS[0];

/**
 * A percentage held to 0–100 and to whole numbers.
 *
 * Anything that is not a finite number reads as unset. Anything outside the
 * range is pulled to the nearest end instead of being discarded, because a
 * `120` or a `-5` still says plainly which end of the bar its writer meant.
 */
export function clampProgress(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const bounded = Math.min(MAX_PROGRESS, Math.max(MIN_PROGRESS, value));
  return Math.round(bounded);
}

/**
 * A percentage written by a human: a trailing `%` and the spaces around it are
 * tolerated and thrown away.
 *
 * Unlike a finance share, a fraction is *not* accepted: `0.4` in a progress
 * field reads as 0.4% and clamps to 0. Progress fields are written in the same
 * units people say out loud, and guessing that small numbers really meant
 * fractions would silently turn "just started" into "nearly half done".
 */
export function parseProgress(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  if (!PROGRESS_VALUE_PATTERN.test(trimmed)) return null;

  const parsed = Number.parseFloat(trimmed.replace(/\s*%$/, ""));
  return clampProgress(parsed);
}

/** A percentage as it is written back: a whole number, no unit. */
export function formatProgress(percent: number | null): string {
  const clamped = clampProgress(percent);
  return clamped === null ? "" : String(clamped);
}

/** The progress carried on an inline task line. */
export function getTaskProgress(taskText: string): TaskProgress {
  const match = taskText.match(PROGRESS_FIELD_PATTERN);
  return { percent: match ? parseProgress(match[1]) : null };
}

export function hasProgressData(progress: TaskProgress): boolean {
  return progress.percent !== null;
}

/**
 * The status a task reads as once its progress is taken into account.
 *
 * Work having started is something the percentage already tells us, so a task
 * left on `todo` while carrying progress is shown as in progress rather than
 * as untouched. This is a display reading only: nothing here writes to the
 * vault, so a chart never quietly rewrites the checkboxes in someone's notes.
 *
 * Only `todo` is overridden. `done` and `canceled` are decisions the user has
 * made about the task as a whole and outrank a number — a task closed at 60%
 * is closed, not still running — and `in_progress` is already the answer.
 * A percentage of exactly 0 means "not started yet", so it changes nothing.
 */
export function effectiveTaskStatus(
  status: TaskStatus,
  progress: TaskProgress
): TaskStatus {
  const percent = clampProgress(progress.percent);
  if (status !== "todo" || percent === null || percent === 0) return status;
  return "in_progress";
}

/**
 * Rewrites a task line to carry exactly this progress: any existing progress
 * field goes, and a canonical one is appended when there is a value. Every
 * other piece of metadata on the line — dates, tags, id, finance,
 * dependencies — is untouched.
 */
export function writeProgressToTaskLine(
  taskLine: string,
  progress: TaskProgress
): string {
  const stripped = taskLine
    .replace(PROGRESS_FIELD_REMOVAL, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+$/, "");

  const percent = clampProgress(progress.percent);
  if (percent === null) return stripped;

  return `${stripped} [${CANONICAL_FIELD}:: ${formatProgress(percent)}]`;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The progress in a note's frontmatter. Numbers and strings both work, so
 * `progress: 40` and `progress: "40%"` mean the same thing — YAML quoting
 * should not change what a note says.
 */
export function getFrontmatterProgress(
  frontmatter: Record<string, unknown>
): TaskProgress {
  for (const name of PROGRESS_FIELDS) {
    const value = frontmatter[name];
    if (value === undefined || value === null) continue;

    if (typeof value === "number") {
      const percent = clampProgress(value);
      if (percent !== null) return { percent };
      continue;
    }

    if (typeof value === "string") {
      const percent = parseProgress(value);
      if (percent !== null) return { percent };
    }
  }

  return { percent: null };
}

/**
 * What to change in a note's frontmatter to make it carry this progress.
 * `remove` covers every accepted spelling, so a note that used `percent`
 * cannot keep it around contradicting the `progress` just written.
 */
export function progressFrontmatterPatch(progress: TaskProgress): {
  set: Record<string, unknown>;
  remove: string[];
} {
  const percent = clampProgress(progress.percent);
  const set: Record<string, unknown> = {};

  if (percent !== null) set[CANONICAL_FIELD] = percent;

  const remove = PROGRESS_FIELDS.filter((name) => set[name] === undefined);

  return { set, remove };
}
