/**
 * People, grades and chargeout rates, read out of a note in the vault.
 *
 * Rates belong to the user, not to the plugin, so they live in a note they can
 * open, edit and link to rather than in settings. The note holds two tables —
 * grade to rate, and person to grade — which keeps rates normalised: putting
 * everyone on a new rate for a grade is one edit, not one per person.
 *
 * Tables are found by their column headers rather than by the heading above
 * them. Heading text would be fragile: the plugin ships in three languages, and
 * people retitle and reorder their own notes. Headers mean the note can carry
 * prose, extra tables and any layout the user likes and still be readable.
 *
 * Nothing here guesses. A row that cannot be read is dropped and reported, so
 * the dashboard can say what it could not understand instead of quietly
 * costing a task at zero.
 *
 * This module deliberately has no imports, so anything can use it.
 */

export interface Grade {
  name: string;
  rate: number;
}

export interface Person {
  name: string;
  grade: string | null;
  /** A rate on the person themselves, which beats their grade's rate. */
  rateOverride: number | null;
}

export type RateProblemReason =
  | "no-rate-table"
  | "no-people-table"
  | "bad-rate"
  | "duplicate-grade"
  | "duplicate-person"
  | "unknown-grade";

export interface RateBookProblem {
  /** 1-based line in the note, or 0 for a problem with the note as a whole. */
  line: number;
  text: string;
  reason: RateProblemReason;
}

export interface RateBook {
  grades: Grade[];
  people: Person[];
  problems: RateBookProblem[];
}

export const EMPTY_RATE_BOOK: RateBook = {
  grades: [],
  people: [],
  problems: [],
};

/* -------------------------------------------------------------------------- */
/* Markdown tables                                                            */
/* -------------------------------------------------------------------------- */

interface TableRow {
  cells: string[];
  line: number;
  text: string;
}

interface Table {
  headers: string[];
  rows: TableRow[];
}

/** A separator row: every cell is dashes, with optional alignment colons. */
function isSeparatorRow(cells: string[]): boolean {
  return (
    cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
  );
}

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

/**
 * Every table in the note. A table is a run of pipe-delimited lines whose
 * second line is a separator — the same rule a markdown renderer applies, so
 * what the plugin sees as a table is what the user sees as one.
 */
function findTables(markdown: string): Table[] {
  const lines = markdown.split(/\r?\n/);
  const tables: Table[] = [];

  let index = 0;
  while (index < lines.length) {
    if (!isTableLine(lines[index])) {
      index += 1;
      continue;
    }

    const headers = splitCells(lines[index]);
    const separator = lines[index + 1];

    if (
      !separator ||
      !isTableLine(separator) ||
      !isSeparatorRow(splitCells(separator))
    ) {
      index += 1;
      continue;
    }

    const rows: TableRow[] = [];
    let cursor = index + 2;
    while (cursor < lines.length && isTableLine(lines[cursor])) {
      rows.push({
        cells: splitCells(lines[cursor]),
        line: cursor + 1,
        text: lines[cursor].trim(),
      });
      cursor += 1;
    }

    tables.push({ headers, rows });
    index = cursor;
  }

  return tables;
}

const GRADE_HEADER = /^grades?$/i;
const RATE_HEADER =
  /^(rate|rates|chargeout|charge.?out.?rate|hourly.?rate|cost)$/i;
const PERSON_HEADER = /^(person|people|name|who|resource)$/i;

function columnIndex(headers: string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function cellAt(row: TableRow, index: number): string {
  return index >= 0 && index < row.cells.length ? row.cells[index] : "";
}

/**
 * A number written by a human. A currency symbol, thousands separators and
 * stray spaces are all tolerated and thrown away, so `£1,450.00` reads as
 * 1450 rather than as a broken row.
 */
function parseRate(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const rate = Number.parseFloat(cleaned);
  return Number.isFinite(rate) ? rate : null;
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/** Names match on meaning, not on typing: case, spacing and links are noise. */
export function normalizePersonKey(name: string): string {
  return name
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, path, alias) =>
      alias ? alias : String(path).split("/").pop()
    )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseRateBook(markdown: string): RateBook {
  const tables = findTables(markdown);

  const grades: Grade[] = [];
  const people: Person[] = [];
  const problems: RateBookProblem[] = [];

  const gradeKeys = new Set<string>();
  const personKeys = new Set<string>();

  let sawRateTable = false;
  let sawPeopleTable = false;

  for (const table of tables) {
    const gradeColumn = columnIndex(table.headers, GRADE_HEADER);
    const rateColumn = columnIndex(table.headers, RATE_HEADER);
    const personColumn = columnIndex(table.headers, PERSON_HEADER);

    // A person column settles it: the people table also carries a grade, and
    // may carry a rate, so it would otherwise look like the rates table too.
    if (personColumn >= 0 && gradeColumn >= 0) {
      sawPeopleTable = true;
      readPeopleTable(
        table,
        { personColumn, gradeColumn, rateColumn },
        {
          people,
          personKeys,
          problems,
        }
      );
      continue;
    }

    if (gradeColumn >= 0 && rateColumn >= 0) {
      sawRateTable = true;
      readRateTable(
        table,
        { gradeColumn, rateColumn },
        {
          grades,
          gradeKeys,
          problems,
        }
      );
    }
  }

  if (!sawRateTable) {
    problems.push({ line: 0, text: "", reason: "no-rate-table" });
  }
  if (!sawPeopleTable) {
    problems.push({ line: 0, text: "", reason: "no-people-table" });
  }

  // Reported last so the grades from every table are in before the check
  for (const person of people) {
    if (person.rateOverride !== null || !person.grade) continue;
    if (gradeKeys.has(normalizePersonKey(person.grade))) continue;

    problems.push({
      line: 0,
      text: person.name,
      reason: "unknown-grade",
    });
  }

  return { grades, people, problems };
}

function readRateTable(
  table: Table,
  columns: { gradeColumn: number; rateColumn: number },
  out: {
    grades: Grade[];
    gradeKeys: Set<string>;
    problems: RateBookProblem[];
  }
): void {
  for (const row of table.rows) {
    const name = cellAt(row, columns.gradeColumn);
    if (!name) continue;

    const key = normalizePersonKey(name);
    if (out.gradeKeys.has(key)) {
      out.problems.push({
        line: row.line,
        text: row.text,
        reason: "duplicate-grade",
      });
      continue;
    }

    const rate = parseRate(cellAt(row, columns.rateColumn));
    if (rate === null) {
      // Dropped rather than costed at zero: an unreadable rate is not free
      out.problems.push({ line: row.line, text: row.text, reason: "bad-rate" });
      continue;
    }

    out.gradeKeys.add(key);
    out.grades.push({ name, rate });
  }
}

function readPeopleTable(
  table: Table,
  columns: { personColumn: number; gradeColumn: number; rateColumn: number },
  out: {
    people: Person[];
    personKeys: Set<string>;
    problems: RateBookProblem[];
  }
): void {
  for (const row of table.rows) {
    const name = cellAt(row, columns.personColumn);
    if (!name) continue;

    const key = normalizePersonKey(name);
    if (out.personKeys.has(key)) {
      out.problems.push({
        line: row.line,
        text: row.text,
        reason: "duplicate-person",
      });
      continue;
    }

    const gradeCell = cellAt(row, columns.gradeColumn);
    const rateCell = cellAt(row, columns.rateColumn);

    // A blank override column is the normal case, not a broken row
    let rateOverride: number | null = null;
    if (rateCell) {
      rateOverride = parseRate(rateCell);
      if (rateOverride === null) {
        out.problems.push({
          line: row.line,
          text: row.text,
          reason: "bad-rate",
        });
      }
    }

    out.personKeys.add(key);
    out.people.push({
      name,
      grade: gradeCell || null,
      rateOverride,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

export type RateSource = "person" | "grade" | "unknown";

export interface RateResolution {
  rate: number | null;
  source: RateSource;
  /** The grade the person sits at, even when it carries no usable rate. */
  grade: string | null;
}

const UNKNOWN_RATE: RateResolution = {
  rate: null,
  source: "unknown",
  grade: null,
};

/**
 * What an hour of this person's time costs: their own rate first, then their
 * grade's, and otherwise nothing at all. An unknown person is never costed at
 * zero silently — the caller reports the shortfall.
 */
export function resolveRate(book: RateBook, person: string): RateResolution {
  const key = normalizePersonKey(person);
  if (!key) return UNKNOWN_RATE;

  const match = book.people.find(
    (candidate) => normalizePersonKey(candidate.name) === key
  );
  if (!match) return UNKNOWN_RATE;

  if (match.rateOverride !== null) {
    return { rate: match.rateOverride, source: "person", grade: match.grade };
  }

  if (match.grade) {
    const gradeKey = normalizePersonKey(match.grade);
    const grade = book.grades.find(
      (candidate) => normalizePersonKey(candidate.name) === gradeKey
    );
    if (grade) {
      return { rate: grade.rate, source: "grade", grade: grade.name };
    }
  }

  return { rate: null, source: "unknown", grade: match.grade };
}

/** Everyone the book knows, for the person picker in the finance modal. */
export function knownPeople(book: RateBook): string[] {
  return book.people.map((person) => person.name);
}
