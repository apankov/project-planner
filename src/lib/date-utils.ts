/**
 * ISO date helpers for the Gantt timeline.
 *
 * Dates in tasks are plain `YYYY-MM-DD` calendar days with no time zone. All
 * arithmetic goes through an "epoch day" integer built from `Date.UTC` so a
 * user in any time zone gets the same day numbers, and so a bar never drifts
 * by one day across a DST boundary.
 */

const MS_PER_DAY = 86400000;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Days since the Unix epoch, or null when the date is missing or malformed. */
export function toEpochDay(iso: string | null | undefined): number | null {
  if (!iso || !ISO_DATE_PATTERN.test(iso)) return null;

  const [year, month, day] = iso.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;

  // Reject calendar overflow such as 2026-02-31, which Date.UTC rolls forward
  const rolled = new Date(utc);
  if (
    rolled.getUTCFullYear() !== year ||
    rolled.getUTCMonth() !== month - 1 ||
    rolled.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(utc / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): string {
  const date = new Date(epochDay * MS_PER_DAY);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today in the user's local time zone, as a calendar day. */
export function todayEpochDay(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / MS_PER_DAY
  );
}

export function todayIso(): string {
  return fromEpochDay(todayEpochDay());
}

export function addDays(iso: string, days: number): string {
  const epochDay = toEpochDay(iso);
  if (epochDay === null) return iso;
  return fromEpochDay(epochDay + days);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function diffDays(from: string, to: string): number {
  const fromDay = toEpochDay(from);
  const toDay = toEpochDay(to);
  if (fromDay === null || toDay === null) return 0;
  return toDay - fromDay;
}

/** Bars are inclusive of both endpoints, so a single day has a length of 1. */
export function inclusiveDayCount(startIso: string, endIso: string): number {
  return Math.max(1, diffDays(startIso, endIso) + 1);
}

/** 0 = Sunday, 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  const epochDay = toEpochDay(iso);
  if (epochDay === null) return 0;
  return new Date(epochDay * MS_PER_DAY).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const day = dayOfWeek(iso);
  return day === 0 || day === 6;
}

/** Monday of the week containing `iso` (ISO-8601 weeks start on Monday). */
export function startOfWeek(iso: string): string {
  const day = dayOfWeek(iso);
  const backToMonday = day === 0 ? 6 : day - 1;
  return addDays(iso, -backToMonday);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function isFirstOfMonth(iso: string): boolean {
  return iso.endsWith("-01");
}

/** The next Monday-to-Friday day on or after `iso`. */
export function nextWorkingDay(iso: string): string {
  let current = iso;
  for (let guard = 0; guard < 7 && isWeekend(current); guard++) {
    current = addDays(current, 1);
  }
  return current;
}

/** The last Monday-to-Friday day on or before `iso`. */
export function previousWorkingDay(iso: string): string {
  let current = iso;
  for (let guard = 0; guard < 7 && isWeekend(current); guard++) {
    current = addDays(current, -1);
  }
  return current;
}

/**
 * Moves `days` working days from `iso`, skipping weekends.
 *
 * Counting is inclusive of the destination but not the origin, so four
 * working days from a Friday is the following Wednesday.
 */
export function addWorkingDays(iso: string, days: number): string {
  if (toEpochDay(iso) === null) return iso;
  if (days === 0) return iso;

  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  let current = iso;

  while (remaining > 0) {
    current = addDays(current, step);
    if (!isWeekend(current)) remaining -= 1;
  }

  return current;
}

/** Working days from `start` to `end`, counting both ends. */
export function workingDayCount(startIso: string, endIso: string): number {
  const start = toEpochDay(startIso);
  const end = toEpochDay(endIso);
  if (start === null || end === null || end < start) return 1;

  let count = 0;
  for (let day = start; day <= end; day++) {
    if (!isWeekend(fromEpochDay(day))) count += 1;
  }

  return Math.max(1, count);
}
