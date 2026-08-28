/**
 * Reading and writing the finance metadata on a task.
 *
 * Planning here is time and materials: a task consumes hours, those hours are
 * worked by named people in some proportion, and on top of that sit materials
 * and expenses. Inline tasks carry all four as Dataview fields on the task line
 * (`[hours:: 12]`, `[people:: Alice 60%, Bob 40%]`); note-based tasks carry them
 * as frontmatter keys. Both end up as one `TaskFinance` so the rest of the
 * plugin does not care where they came from.
 *
 * This module deliberately has no imports, for the same reason `task-dates`
 * has none: the task factory, both task classes and `utils` all need it, and
 * `utils` imports the task classes.
 */

/** A person's share of a task's hours. `share` is a fraction — 0.6 is 60%. */
export interface TaskAllocation {
  person: string;
  share: number;
}

/** A material or expense booked against a task. */
export interface TaskExpense {
  description: string;
  amount: number;
}

export interface TaskFinance {
  /** Per-task override of the global hours-per-day. */
  hoursPerDay: number | null;
  /** Explicit total hours, which wins over the hours-per-day calculation. */
  totalHours: number | null;
  allocations: TaskAllocation[];
  expenses: TaskExpense[];
}

export const EMPTY_TASK_FINANCE: TaskFinance = {
  hoursPerDay: null,
  totalHours: null,
  allocations: [],
  expenses: [],
};

/**
 * The four fields, each with the spellings accepted on read. The first entry
 * is the canonical one and the only one ever written back.
 */
const FINANCE_FIELDS = {
  totalHours: ["hours", "totalHours", "estimatedHours"],
  hoursPerDay: ["hoursPerDay", "hours-per-day", "hoursperday"],
  allocations: ["people", "allocations", "who"],
  expenses: ["costs", "expenses", "materials"],
} as const;

type FinanceFieldKey = keyof typeof FINANCE_FIELDS;

const ALL_FIELD_NAMES = Object.values(FINANCE_FIELDS)
  .flatMap((names) => [...names])
  .join("|");

/**
 * A field's value: either a whole wiki-link or any character that is not a
 * closing bracket. The wiki-link branch is what lets `[people:: [[Alice]] 60%]`
 * parse — a plain "not a bracket" value would stop at the first `]`.
 */
const FIELD_VALUE = "((?:\\[\\[[^\\]]*\\]\\]|[^\\])])*)";

function fieldPattern(names: readonly string[], flags: string): RegExp {
  return new RegExp(
    `[[(]{1,2}(?:${names.join("|")})::\\s*${FIELD_VALUE}[\\])]{1,2}`,
    flags
  );
}

/**
 * Every finance field in every accepted spelling, for stripping them out of a
 * task's display summary and out of a line before rewriting it.
 */
export const FINANCE_FIELD_REMOVAL = fieldPattern([ALL_FIELD_NAMES], "gi");

/**
 * Entries are separated by `;` or by a comma — but not a comma sitting inside a
 * number, so `Loom kit 1,200` stays one entry. A label that needs a comma of
 * its own has to use the semicolon separator.
 */
const ENTRY_SEPARATOR = /;|,(?!\d)/;

/**
 * Strips `[[ ]]` off a name and collapses whitespace. A link resolves to what
 * the reader sees: its display text, or the note's own name when the link
 * points into a folder — `[[People/Alice]]` is Alice, not People/Alice.
 */
function cleanLabel(value: string): string {
  return value
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match: string, path: string, alias?: string) =>
        alias ? alias : (path.split("/").pop() ?? path)
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A number written by a human: thousands separators, spaces and a currency
 * symbol are all tolerated and thrown away.
 */
function parseNumber(token: string): number | null {
  const cleaned = token.replace(/%$/, "").replace(/[^\d.-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * A token that is a number and nothing else, give or take a currency symbol
 * and a trailing `%`. Deliberately stricter than `parseNumber`: without this,
 * the last word of `[people:: Team Q4]` would read as a share of 4%.
 */
const NUMERIC_TOKEN = /^[$£€¥]?-?\d[\d,_]*(?:\.\d+)?%?$/;

/** The trailing number of an entry, plus the label in front of it. */
function splitTrailingNumber(entry: string): {
  label: string;
  token: string | null;
} {
  const trimmed = entry.trim();
  if (!trimmed) return { label: "", token: null };

  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) {
    // A bare token: a number on its own, or a label with no number
    return NUMERIC_TOKEN.test(trimmed)
      ? { label: "", token: trimmed }
      : { label: trimmed, token: null };
  }

  const token = trimmed.slice(lastSpace + 1);
  if (!NUMERIC_TOKEN.test(token)) return { label: trimmed, token: null };

  return { label: trimmed.slice(0, lastSpace), token };
}

/**
 * A share as a fraction. `60%`, `60` and `0.6` all mean the same thing —
 * anything at or below 1 written without a `%` is read as a fraction already.
 */
function parseShare(token: string): number | null {
  const value = parseNumber(token);
  if (value === null) return null;

  if (token.trim().endsWith("%")) return value / 100;
  return value <= 1 ? value : value / 100;
}

/**
 * People and their shares. An entry with no number means the whole task —
 * `[people:: Alice]` reads as Alice at 100%, which is what someone typing that
 * by hand means. Entries that parse to nothing are dropped; their siblings
 * survive.
 */
export function parseAllocationList(value: string): TaskAllocation[] {
  const allocations: TaskAllocation[] = [];

  for (const entry of value.split(ENTRY_SEPARATOR)) {
    const { label, token } = splitTrailingNumber(entry);
    const person = cleanLabel(label);
    if (!person) continue;

    const share = token === null ? 1 : parseShare(token);
    if (share === null) continue;

    allocations.push({ person, share });
  }

  return allocations;
}

/**
 * Materials and expenses. Unlike people, an entry with no amount is
 * meaningless, so it is dropped rather than guessed at. A negative amount is
 * kept — that is a credit.
 */
export function parseExpenseList(value: string): TaskExpense[] {
  const expenses: TaskExpense[] = [];

  for (const entry of value.split(ENTRY_SEPARATOR)) {
    const { label, token } = splitTrailingNumber(entry);
    if (token === null) continue;

    const amount = parseNumber(token);
    if (amount === null) continue;

    const description = cleanLabel(label);
    if (!description) continue;

    expenses.push({ description, amount });
  }

  return expenses;
}

/** Trims trailing zeros so 60 comes out as `60%`, not `60.00%`. */
function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatAllocationList(allocations: TaskAllocation[]): string {
  return allocations
    .map(({ person, share }) => `${person} ${formatNumber(share * 100)}%`)
    .join(", ");
}

export function formatExpenseList(expenses: TaskExpense[]): string {
  return expenses
    .map(({ description, amount }) => `${description} ${formatNumber(amount)}`)
    .join(", ");
}

/** The raw value of a field on a task line, or null when it carries none. */
function readField(taskText: string, key: FinanceFieldKey): string | null {
  const match = taskText.match(fieldPattern(FINANCE_FIELDS[key], "i"));
  return match ? match[1] : null;
}

/**
 * A non-negative number, or null. Zero is a legitimate answer — a zero-hour
 * placeholder task is a real thing — so only a missing, unparseable or
 * negative value falls back.
 */
function readNonNegative(value: string | null): number | null {
  if (value === null) return null;

  const parsed = parseNumber(value);
  if (parsed === null || parsed < 0) return null;

  return parsed;
}

/** The finance metadata carried on an inline task line. */
export function getTaskFinance(taskText: string): TaskFinance {
  const people = readField(taskText, "allocations");
  const costs = readField(taskText, "expenses");

  return {
    hoursPerDay: readNonNegative(readField(taskText, "hoursPerDay")),
    totalHours: readNonNegative(readField(taskText, "totalHours")),
    allocations: people === null ? [] : parseAllocationList(people),
    expenses: costs === null ? [] : parseExpenseList(costs),
  };
}

export function hasFinanceData(finance: TaskFinance): boolean {
  return (
    finance.hoursPerDay !== null ||
    finance.totalHours !== null ||
    finance.allocations.length > 0 ||
    finance.expenses.length > 0
  );
}

/** The canonical field name, i.e. the one written back to the vault. */
function canonicalName(key: FinanceFieldKey): string {
  return FINANCE_FIELDS[key][0];
}

/**
 * Rewrites a task line to carry exactly this finance data: every existing
 * finance field goes, and the ones with a value are appended in a fixed order.
 * Everything else on the line — dates, tags, id, dependencies — is untouched.
 */
export function writeFinanceToTaskLine(
  taskLine: string,
  finance: TaskFinance
): string {
  const stripped = taskLine
    .replace(FINANCE_FIELD_REMOVAL, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+$/, "");

  const fields: string[] = [];

  if (finance.totalHours !== null) {
    fields.push(
      `[${canonicalName("totalHours")}:: ${formatNumber(finance.totalHours)}]`
    );
  }
  if (finance.hoursPerDay !== null) {
    fields.push(
      `[${canonicalName("hoursPerDay")}:: ${formatNumber(finance.hoursPerDay)}]`
    );
  }
  if (finance.allocations.length > 0) {
    fields.push(
      `[${canonicalName("allocations")}:: ${formatAllocationList(finance.allocations)}]`
    );
  }
  if (finance.expenses.length > 0) {
    fields.push(
      `[${canonicalName("expenses")}:: ${formatExpenseList(finance.expenses)}]`
    );
  }

  if (fields.length === 0) return stripped;

  return `${stripped} ${fields.join(" ")}`;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter                                                                */
/* -------------------------------------------------------------------------- */

/** The first of these keys the frontmatter actually carries. */
function readFrontmatterField(
  frontmatter: Record<string, unknown>,
  key: FinanceFieldKey
): unknown {
  for (const name of FINANCE_FIELDS[key]) {
    if (frontmatter[name] !== undefined && frontmatter[name] !== null) {
      return frontmatter[name];
    }
  }
  return undefined;
}

function readFrontmatterNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string") return readNonNegative(value);
  return null;
}

function pickString(entry: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "string" && value.trim()) return cleanLabel(value);
  }
  return "";
}

function pickNumber(
  entry: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = parseNumber(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

/**
 * Frontmatter allocations. Three shapes are accepted, because people copy the
 * compact inline form into a note as often as they write the list out:
 *
 *   people: "Alice 60%, Bob 40%"
 *   people: [{ person: Alice, share: 60 }]
 *   people: ["Alice 60%"]
 */
function readFrontmatterAllocations(value: unknown): TaskAllocation[] {
  if (typeof value === "string") return parseAllocationList(value);
  if (!Array.isArray(value)) return [];

  const allocations: TaskAllocation[] = [];

  for (const entry of value) {
    if (typeof entry === "string") {
      allocations.push(...parseAllocationList(entry));
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const person = pickString(record, ["person", "name", "who"]);
    if (!person) continue;

    const raw = pickNumber(record, ["share", "percent", "proportion"]);
    const share = raw === null ? 1 : raw <= 1 ? raw : raw / 100;
    allocations.push({ person, share });
  }

  return allocations;
}

/** Frontmatter expenses, in the same three shapes as allocations. */
function readFrontmatterExpenses(value: unknown): TaskExpense[] {
  if (typeof value === "string") return parseExpenseList(value);
  if (!Array.isArray(value)) return [];

  const expenses: TaskExpense[] = [];

  for (const entry of value) {
    if (typeof entry === "string") {
      expenses.push(...parseExpenseList(entry));
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const description = pickString(record, ["description", "name", "item"]);
    if (!description) continue;

    const amount = pickNumber(record, ["amount", "cost", "value"]);
    if (amount === null) continue;

    expenses.push({ description, amount });
  }

  return expenses;
}

export function getFrontmatterFinance(
  frontmatter: Record<string, unknown>
): TaskFinance {
  return {
    hoursPerDay: readFrontmatterNumber(
      readFrontmatterField(frontmatter, "hoursPerDay")
    ),
    totalHours: readFrontmatterNumber(
      readFrontmatterField(frontmatter, "totalHours")
    ),
    allocations: readFrontmatterAllocations(
      readFrontmatterField(frontmatter, "allocations")
    ),
    expenses: readFrontmatterExpenses(
      readFrontmatterField(frontmatter, "expenses")
    ),
  };
}

/**
 * What to change in a note's frontmatter to make it carry this finance data.
 * `remove` covers every accepted spelling, so switching from `estimatedHours`
 * to `hours` does not leave the old key behind contradicting the new one.
 */
export function financeFrontmatterPatch(finance: TaskFinance): {
  set: Record<string, unknown>;
  remove: string[];
} {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  const keep = (key: FinanceFieldKey, value: unknown) => {
    set[canonicalName(key)] = value;
  };

  if (finance.totalHours !== null) keep("totalHours", finance.totalHours);
  if (finance.hoursPerDay !== null) keep("hoursPerDay", finance.hoursPerDay);
  if (finance.allocations.length > 0) {
    keep(
      "allocations",
      finance.allocations.map(({ person, share }) => ({
        person,
        share: Math.round(share * 10000) / 100,
      }))
    );
  }
  if (finance.expenses.length > 0) {
    keep(
      "expenses",
      finance.expenses.map(({ description, amount }) => ({
        description,
        amount,
      }))
    );
  }

  for (const names of Object.values(FINANCE_FIELDS)) {
    for (const name of names) {
      if (set[name] === undefined) remove.push(name);
    }
  }

  return { set, remove };
}
