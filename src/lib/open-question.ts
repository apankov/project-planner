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
 *
 * An answer goes in a callout on the line beneath, where it reads as prose and
 * can run as long as it needs to:
 *
 *     [oq:: Is the rollout date fixed?]
 *     > [!answer] Fixed. Confirmed 12 March by Ops.
 *
 * It has to start on the very next line. Anything else — a blank line, a
 * paragraph of your own — means the question has no answer yet, which is what
 * keeps writing one from ever overwriting prose that was already there.
 */

import {
  ANSWER_CALLOUT_CONTINUATION,
  ANSWER_CALLOUT_START,
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
  /** The answer written beneath it, as prose, or null while it has none. */
  answer: string | null;
  /**
   * The last line the answer callout occupies, or null when there is none.
   * Zero-based like `line`, and inclusive.
   */
  answerEndLine: number | null;
}

/** A note's display name: `Projects/Kohtari rollout.md` reads as the last part. */
export function noteNameOf(notePath: string): string {
  const file = notePath.split("/").pop() ?? notePath;
  return file.replace(/\.md$/i, "");
}

/** An answer callout found under a question: its prose and where it ends. */
export interface AnswerBlock {
  answer: string;
  /** Inclusive, zero-based. */
  endLine: number;
}

/**
 * The answer callout starting on the line after `questionLine`, if there is
 * one. It must start there and nowhere else — see the note at the top of this
 * file for why.
 */
export function parseAnswerBlock(
  lines: string[],
  questionLine: number
): AnswerBlock | null {
  const start = lines[questionLine + 1];
  if (start === undefined) return null;

  const opening = start.match(ANSWER_CALLOUT_START);
  if (!opening) return null;

  const parts = [opening[2]];
  let endLine = questionLine + 1;

  for (let index = endLine + 1; index < lines.length; index += 1) {
    const continuation = lines[index].match(ANSWER_CALLOUT_CONTINUATION);
    if (!continuation) break;

    parts.push(continuation[1]);
    endLine = index;
  }

  return { answer: parts.join("\n").trim(), endLine };
}

/**
 * The question on a line, or null when the line holds none.
 *
 * A task line is deliberately none of them: a marker written onto one is
 * metadata on a task that already has a card elsewhere.
 *
 * `lines` is the whole note, because a question is not only its own line: the
 * answer beneath it is part of what the question is.
 */
export function parseOpenQuestionLine(
  rawLine: string,
  notePath: string,
  line: number,
  lines: string[] = [rawLine]
): OpenQuestion | null {
  if (TASK_LINE_PREFIX.test(rawLine)) return null;

  const match = rawLine.match(OPEN_QUESTION_FIELD_PATTERN);
  if (!match) return null;

  const question = match[1].trim();
  if (question.length === 0) return null;

  const resolvedOn = getResolvedDate(rawLine);
  const block = parseAnswerBlock(lines, line);

  return {
    id: `${notePath}:${line}`,
    question,
    resolved: resolvedOn !== null,
    resolvedOn,
    notePath,
    noteName: noteNameOf(notePath),
    line,
    rawLine,
    answer: block && block.answer.length > 0 ? block.answer : null,
    answerEndLine: block ? block.endLine : null,
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
  const lines = content.split("\n");
  const questions: OpenQuestion[] = [];

  lines.forEach((rawLine, line) => {
    const question = parseOpenQuestionLine(rawLine, notePath, line, lines);
    if (question) questions.push(question);
  });

  return questions;
}

/** The whitespace a line opens with, so an answer can be indented to match. */
function indentOf(line: string): string {
  return line.match(/^\s*/)?.[0] ?? "";
}

/** An answer as the lines of the callout that will hold it. */
export function answerBlockLines(answer: string, indent: string): string[] {
  const [first, ...rest] = answer.trim().split("\n");

  return [
    `${indent}> [!answer] ${first}`.trimEnd(),
    ...rest.map((line) => `${indent}> ${line}`.trimEnd()),
  ];
}

/**
 * The note's lines with this question's answer set to exactly this — replacing
 * the callout already there, adding one where there was none, and removing it
 * when the answer is cleared.
 *
 * Only the answer moves. Everything above the question, and everything below
 * whatever callout was already attached to it, is passed through untouched.
 */
export function writeAnswerToLines(
  lines: string[],
  questionLine: number,
  answer: string | null
): string[] {
  const existing = parseAnswerBlock(lines, questionLine);
  const before = lines.slice(0, questionLine + 1);
  const after = lines.slice(existing ? existing.endLine + 1 : questionLine + 1);

  const trimmed = answer?.trim() ?? "";
  if (trimmed.length === 0) return [...before, ...after];

  return [
    ...before,
    ...answerBlockLines(trimmed, indentOf(lines[questionLine])),
    ...after,
  ];
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
