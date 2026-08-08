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
 */

export interface GanttMilestone {
  id: string;
  label: string;
  /** The day it falls on, as `YYYY-MM-DD`. */
  date: string;
}

export type MilestoneChanges = Partial<Omit<GanttMilestone, "id">>;

/** Where a milestone sits relative to today, for how it is drawn. */
export type MilestoneStatus = "past" | "today" | "upcoming";

/**
 * Guards what came out of settings. Data files are hand-editable and survive
 * downgrades, so anything unreadable is dropped rather than drawn.
 */
export function isGanttMilestone(value: unknown): value is GanttMilestone {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<GanttMilestone>;
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
    milestones.push({ id: entry.id, label: entry.label, date: entry.date });
  }

  return sortMilestones(milestones);
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
