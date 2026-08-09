import { addDays, diffDays, toEpochDay } from "./date-utils";

/**
 * Milestones: named days marked across the timeline.
 *
 * A milestone is deliberately not a task. It has no note behind it, no
 * duration and no dependencies — "Release 1.0" is a date the plan is measured
 * against, not something anybody ticks off. So milestones live in settings
 * rather than the vault, and nothing here ever writes to a note.
 *
 * The list is kept sorted by date so the marker layer draws left to right and
 * two milestones on the same day always land in the same order.
 *
 * Each milestone chooses how it is drawn: as a flag in the lane above the
 * chart, or as a row filed among the tasks. Neither makes it a task — a row
 * milestone has no bar, no duration, no dependencies and no status, and it is
 * counted by nothing that counts tasks.
 */

/**
 * Where a milestone is drawn.
 *
 * `lane` is the original: a flag in the band above the chart with a guide line
 * running down it. `row` puts it in the task list instead, on a line of its
 * own — still not a task, just filed among them.
 */
export type MilestoneDisplay = "lane" | "row";

export const MILESTONE_DISPLAYS: MilestoneDisplay[] = ["lane", "row"];

export interface GanttMilestone {
  id: string;
  label: string;
  /** The day it falls on, as `YYYY-MM-DD`. */
  date: string;
  /** Lane flag or list row. Written by every milestone this version saves. */
  display: MilestoneDisplay;
}

/**
 * A milestone as a data file may hold it.
 *
 * `display` arrived after milestones did, so a settings file written by an
 * earlier version simply has no such key — and a hand-edited one can hold
 * anything at all. Neither is a reason to lose the milestone, so the stored
 * shape says nothing about what `display` is and `readMilestoneDisplay` turns
 * whatever it finds into one of the two real values.
 */
export interface StoredGanttMilestone {
  id: string;
  label: string;
  date: string;
  display?: unknown;
}

export type MilestoneChanges = Partial<Omit<GanttMilestone, "id">>;

/** Where a milestone sits relative to today, for how it is drawn. */
export type MilestoneStatus = "past" | "today" | "upcoming";

/**
 * The prefix a row milestone's slot in the manual row order carries.
 *
 * The order (`gantt-order`) is a flat list of task IDs, and a row milestone
 * needs a place in it without pretending to be a task. Namespacing its ID is
 * what keeps the two apart: an inline task's ID is `[a-zA-Z0-9_-]+`, which can
 * never contain a colon, and a note task's ID is its path, which cannot hold
 * one either on any platform Obsidian runs on. So a key starting `milestone:`
 * is unambiguously a milestone, and every ordering function keeps working on
 * plain strings without knowing milestones exist.
 */
export const MILESTONE_ORDER_PREFIX = "milestone:";

/** The slot a row milestone takes in the manual row order. */
export function milestoneOrderKey(milestoneId: string): string {
  return `${MILESTONE_ORDER_PREFIX}${milestoneId}`;
}

/** The milestone an order slot names, or null when the slot is a task's. */
export function milestoneIdFromOrderKey(key: string): string | null {
  if (!key.startsWith(MILESTONE_ORDER_PREFIX)) return null;
  const id = key.slice(MILESTONE_ORDER_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** Anything that is not the word "row" means the original lane flag. */
export function readMilestoneDisplay(value: unknown): MilestoneDisplay {
  return value === "row" ? "row" : "lane";
}

/**
 * Guards what came out of settings. Data files are hand-editable and survive
 * downgrades, so anything unreadable is dropped rather than drawn — but a
 * milestone saved before `display` existed is perfectly readable, so an absent
 * or nonsense `display` is normalised rather than treated as damage.
 */
export function isGanttMilestone(
  value: unknown
): value is StoredGanttMilestone {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<StoredGanttMilestone>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.label === "string" &&
    typeof candidate.date === "string" &&
    toEpochDay(candidate.date) !== null
  );
}

/** Earliest first, ties broken by label so the order never wobbles. */
export function sortMilestones(milestones: GanttMilestone[]): GanttMilestone[] {
  return [...milestones].sort((a, b) => {
    // diffDays(b, a) is a - b in days, i.e. ascending by date
    const byDate = diffDays(b.date, a.date);
    if (byDate !== 0) return byDate;

    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

/** The stored milestones, cleaned up: malformed and duplicate entries go. */
export function readMilestones(value: unknown): GanttMilestone[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const milestones: GanttMilestone[] = [];

  for (const entry of value) {
    if (!isGanttMilestone(entry) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    milestones.push({
      id: entry.id,
      label: entry.label,
      date: entry.date,
      display: readMilestoneDisplay(entry.display),
    });
  }

  return sortMilestones(milestones);
}

/** The ones drawn as flags in the band above the chart. */
export function laneMilestones(milestones: GanttMilestone[]): GanttMilestone[] {
  return milestones.filter((milestone) => milestone.display !== "row");
}

/** The ones drawn as a line in the task list. */
export function rowMilestones(milestones: GanttMilestone[]): GanttMilestone[] {
  return milestones.filter((milestone) => milestone.display === "row");
}

export function findMilestone(
  milestones: GanttMilestone[],
  id: string
): GanttMilestone | null {
  return milestones.find((milestone) => milestone.id === id) ?? null;
}

/** Adds a milestone, replacing any existing one with the same id. */
export function addMilestone(
  milestones: GanttMilestone[],
  milestone: GanttMilestone
): GanttMilestone[] {
  return sortMilestones([
    ...milestones.filter((existing) => existing.id !== milestone.id),
    milestone,
  ]);
}

export function updateMilestone(
  milestones: GanttMilestone[],
  id: string,
  changes: MilestoneChanges
): GanttMilestone[] {
  return sortMilestones(
    milestones.map((milestone) =>
      milestone.id === id ? { ...milestone, ...changes } : milestone
    )
  );
}

export function removeMilestone(
  milestones: GanttMilestone[],
  id: string
): GanttMilestone[] {
  return milestones.filter((milestone) => milestone.id !== id);
}

/** Drags a milestone by whole days; an unknown id leaves the list alone. */
export function shiftMilestone(
  milestones: GanttMilestone[],
  id: string,
  days: number
): GanttMilestone[] {
  const target = findMilestone(milestones, id);
  if (!target || days === 0) return [...milestones];

  return updateMilestone(milestones, id, { date: addDays(target.date, days) });
}

export function milestoneStatus(
  milestone: GanttMilestone,
  today: string
): MilestoneStatus {
  const days = diffDays(today, milestone.date);
  if (days === 0) return "today";
  return days < 0 ? "past" : "upcoming";
}
