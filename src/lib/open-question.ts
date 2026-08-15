/**
 * Reading and writing the open questions scattered through a vault.
 *
 * Working through a note you realise you do not know something — what the real
 * deadline is, who owns the decision, whether the number is gross or net. The
 * question belongs in the note that raised it, where the context is, not in a
 * separate inbox that has to be kept in step with it. Writing it as an inline
 * field lets it stay put and still be gathered up:
 *
 *     [oq:: Is the rollout date fixed, or the one we hope for?]
 *
 * A field rather than a tag, because a vault's tags already mean something else
 * and one borrowed for questions would show up in every query that reads them.
 *
 * A question is not a task, so nothing here goes near `BaseTask`. It has no
 * status to cycle, no dates to schedule, no cost and no place in a hierarchy —
 * it is a line of text, where it was found, and whether it has been answered.
 *
 * Answering marks the line rather than removing it. The question and the day it
 * stopped being open are both worth keeping in the note that raised them, and a
 * marked line is one regex away from being unmarked again:
 *
 *     [oq:: Is the rollout date fixed?] [resolved:: 2025-01-01]
 *
 * The marker is only read on a line of its own. On a task line it is ignored,
 * because a task already has a card of its own everywhere else in the plugin
 * and a second card saying the same thing helps nobody.
 */

import {
  OPEN_QUESTION_FIELD_NAMES,
  OPEN_QUESTION_FIELD_PATTERN,
  RESOLVED_FIELD_NAMES,
  RESOLVED_FIELD_PATTERN,
  RESOLVED_FIELD_REMOVAL,
  TASK_LINE_PREFIX,
} from "./task-regex";

/** Every accepted spelling of the question field, canonical first. */
export const OPEN_QUESTION_FIELDS = OPEN_QUESTION_FIELD_NAMES.split("|");

/** Every accepted spelling of the resolved field, canonical first. */
export const RESOLVED_FIELDS = RESOLVED_FIELD_NAMES.split("|");

/** The field name written back to the vault when a question is answered. */
const CANONICAL_RESOLVED_FIELD = RESOLVED_FIELDS[0];

/**
 * One question, as the plugin holds it.
 *
 * There is no ID. Stamping one into every question would litter the notes with
 * the very clutter this feature exists to avoid, so a question is known by
 * where it was found. `rawLine` travels with it so a write can check the line
 * is still the one that was read before touching it.
 */
export interface OpenQuestion {
  /** Where it was found, as `<path>:<line>`. Stable enough to key a card by. */
  id: string;
  /** The question itself, as written. */
  question: string;
  resolved: boolean;
  /** The day it was answered, when the line says. */
  resolvedOn: string | null;
  notePath: string;
  /** The note's name without its folders or extension, for display. */
  noteName: string;
  /** Zero-based, matching the array a file splits into. */
  line: number;
  /** The whole line, exactly as it was read. */
  rawLine: string;
}

/** A note's display name: `Projects/Kohtari rollout.md` reads as the last part. */
export function noteNameOf(notePath: string): string {
  const file = notePath.split("/").pop() ?? notePath;
  return file.replace(/\.md$/i, "");
}

/**
 * The question on a line, or null when the line holds none.
 *
 * A task line is deliberately none of them: a marker written onto one is
 * metadata on a task that already has a card elsewhere.
 */
export function parseOpenQuestionLine(
  rawLine: string,
  notePath: string,
  line: number
): OpenQuestion | null {
  if (TASK_LINE_PREFIX.test(rawLine)) return null;

  const match = rawLine.match(OPEN_QUESTION_FIELD_PATTERN);
  if (!match) return null;

  const question = match[1].trim();
  if (question.length === 0) return null;

  const resolvedOn = getResolvedDate(rawLine);

  return {
    id: `${notePath}:${line}`,
    question,
    resolved: resolvedOn !== null,
    resolvedOn,
    notePath,
    noteName: noteNameOf(notePath),
    line,
    rawLine,
  };
}

/** The date a line says its question was answered, or null while it is open. */
export function getResolvedDate(rawLine: string): string | null {
  const match = rawLine.match(RESOLVED_FIELD_PATTERN);
  if (!match) return null;

  const value = match[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  return value.length > 0 ? value : null;
}

/** Every question in a note's contents, in the order they appear. */
export function scanOpenQuestions(
  content: string,
  notePath: string
): OpenQuestion[] {
  const questions: OpenQuestion[] = [];

  content.split("\n").forEach((rawLine, line) => {
    const question = parseOpenQuestionLine(rawLine, notePath, line);
    if (question) questions.push(question);
  });

  return questions;
}

/**
 * Rewrites a line to say exactly this about being answered: any existing
 * resolved field goes, and a canonical one is appended when there is a date.
 * The question itself, and anything else on the line, is left alone.
 */
export function writeResolvedToLine(
  rawLine: string,
  resolvedOn: string | null
): string {
  // Only runs of space that follow something are closed up: a question written
  // as an indented list item keeps the indentation that put it there
  const stripped = rawLine
    .replace(RESOLVED_FIELD_REMOVAL, "")
    .replace(/(\S)[^\S\n]{2,}/g, "$1 ")
    .replace(/\s+$/, "");

  if (resolvedOn === null) return stripped;

  return `${stripped} [${CANONICAL_RESOLVED_FIELD}:: ${resolvedOn}]`;
}

/** The marker to drop at the cursor, wrapping whatever was selected. */
export function openQuestionMarker(question = ""): string {
  return `[${OPEN_QUESTION_FIELDS[0]}:: ${question.trim()}]`;
}

/**
 * Where the cursor should sit once a marker is inserted: inside the brackets,
 * ready to type. Counted from the start of the marker.
 */
export function openQuestionMarkerCursor(question = ""): number {
  return openQuestionMarker(question).length - 1;
}

/** Newest note first is meaningless here; a stable read order is not. */
export function sortOpenQuestions(questions: OpenQuestion[]): OpenQuestion[] {
  return [...questions].sort((left, right) => {
    if (left.notePath !== right.notePath) {
      return left.notePath.localeCompare(right.notePath);
    }
    return left.line - right.line;
  });
}

/** Whether a question answers to a search, matched against text and note. */
export function matchesQuery(question: OpenQuestion, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;

  return (
    question.question.toLowerCase().includes(needle) ||
    question.noteName.toLowerCase().includes(needle)
  );
}
