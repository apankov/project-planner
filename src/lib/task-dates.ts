/**
 * Reading date metadata off a task.
 *
 * Inline tasks carry dates in the task line in one of three notations —
 * emoji (`📅 2026-08-10`), Dataview (`[due:: 2026-08-10]`) or plain text
 * (`due: 2026-08-10`). Note-based tasks carry them as frontmatter keys. Both
 * end up as a `TaskDateProperty[]` on the task so the rest of the plugin does
 * not care where they came from.
 *
 * This module deliberately has no imports: it sits at the bottom of the
 * dependency graph so the task factory, the task classes, and `utils` can all
 * use it without an import cycle.
 */

export type TaskDateType =
  "due" | "scheduled" | "start" | "created" | "done" | "canceled";

export interface TaskDateProperty {
  type: TaskDateType;
  date: string;
}

export const TASK_DATE_DEFINITIONS: Array<{
  type: TaskDateType;
  emoji: string;
  fields: string[];
}> = [
  { type: "due", emoji: "📅", fields: ["due"] },
  { type: "scheduled", emoji: "⏳", fields: ["scheduled"] },
  { type: "start", emoji: "🛫", fields: ["start"] },
  { type: "created", emoji: "➕", fields: ["created"] },
  { type: "done", emoji: "✅", fields: ["completion", "done"] },
  {
    type: "canceled",
    emoji: "❌",
    fields: ["canceled", "cancelled"],
  },
];

export function getTaskDateProperties(taskText: string): TaskDateProperty[] {
  const datePattern = "(\\d{4}-\\d{2}-\\d{2})";

  return TASK_DATE_DEFINITIONS.flatMap(({ type, emoji, fields }) => {
    const emojiMatch = taskText.match(
      new RegExp(`${emoji}\\s*${datePattern}`, "u")
    );
    if (emojiMatch) {
      return [{ type, date: emojiMatch[1] }];
    }

    for (const field of fields) {
      const dataviewMatch = taskText.match(
        new RegExp(
          `(?:\\[\\[?|\\()${field}::\\s*${datePattern}(?:\\]\\]?|\\))`,
          "i"
        )
      );
      if (dataviewMatch) {
        return [{ type, date: dataviewMatch[1] }];
      }

      const textMatch = taskText.match(
        new RegExp(`(?:^|\\s)${field}:\\s*${datePattern}(?=\\s|$)`, "i")
      );
      if (textMatch) {
        return [{ type, date: textMatch[1] }];
      }
    }

    return [];
  });
}

/** The date of a given type, or null when the task does not carry one. */
export function findTaskDate(
  dates: TaskDateProperty[] | undefined,
  type: TaskDateType
): string | null {
  return dates?.find((entry) => entry.type === type)?.date ?? null;
}

/**
 * Frontmatter date keys recognised on note-based tasks, mapped to the date
 * type they represent. Both TaskNotes (`due`) and Tasks-plugin style
 * (`dueDate`) spellings are accepted.
 */
const FRONTMATTER_DATE_KEYS: Array<{ key: string; type: TaskDateType }> = [
  { key: "due", type: "due" },
  { key: "dueDate", type: "due" },
  { key: "scheduled", type: "scheduled" },
  { key: "scheduledDate", type: "scheduled" },
  { key: "start", type: "start" },
  { key: "startDate", type: "start" },
  { key: "created", type: "created" },
  { key: "done", type: "done" },
  { key: "completed", type: "done" },
  { key: "completedDate", type: "done" },
  { key: "canceled", type: "canceled" },
  { key: "cancelled", type: "canceled" },
];

function normalizeFrontmatterDate(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  // Obsidian parses unquoted YAML dates into Date objects
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = String(value.getUTCFullYear()).padStart(4, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return null;
}

export function getFrontmatterDateProperties(
  frontmatter: Record<string, unknown>
): TaskDateProperty[] {
  const seen = new Set<TaskDateType>();
  const dates: TaskDateProperty[] = [];

  for (const { key, type } of FRONTMATTER_DATE_KEYS) {
    if (seen.has(type)) continue;
    const date = normalizeFrontmatterDate(frontmatter[key]);
    if (!date) continue;
    seen.add(type);
    dates.push({ type, date });
  }

  return dates;
}

/** The frontmatter key a note task's date of this type is written to. */
export function frontmatterKeyForDate(type: TaskDateType): string {
  return type === "done" ? "completed" : type;
}

/**
 * Every frontmatter key that would be read as a date of this type.
 *
 * Clearing a date has to take all of them off, not just the canonical one: a
 * note written with `dueDate:` and cleared through `due:` would keep the old
 * value and go on reporting a due date the user had just deleted.
 */
export function frontmatterKeysForDate(type: TaskDateType): string[] {
  return FRONTMATTER_DATE_KEYS.filter((entry) => entry.type === type).map(
    (entry) => entry.key
  );
}
