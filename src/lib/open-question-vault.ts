/**
 * Finding open questions in the vault, and marking them answered.
 *
 * Dataview cannot help here. Its index only knows about checkbox lines, and an
 * open question is deliberately not one — so the questions are read straight
 * off the files. That costs a pass over every note, but it buys the one view in
 * this plugin that renders with Dataview absent, which is the right trade for a
 * feature whose whole point is catching a thought wherever it is had.
 *
 * Reads go through `cachedRead`, which is what Obsidian asks for when a read
 * will not be followed by a write to the same content.
 */

import { App, TFile } from "obsidian";
import {
  OpenQuestion,
  scanOpenQuestions,
  sortOpenQuestions,
  writeResolvedToLine,
} from "./open-question";

/** Every open question in the vault, in a stable note-then-line order. */
export async function getAllOpenQuestions(app: App): Promise<OpenQuestion[]> {
  const files = app.vault.getMarkdownFiles();

  const perFile = await Promise.all(
    files.map(async (file) => {
      const content = await app.vault.cachedRead(file);
      // Cheap reject first: most notes hold no question at all, and a substring
      // test is far less work than splitting the file into lines
      if (!content.includes("::")) return [];
      return scanOpenQuestions(content, file.path);
    })
  );

  return sortOpenQuestions(perFile.flat());
}

/**
 * Thrown when the line a question was read from is no longer there.
 *
 * A question is known by where it was found, so a note edited in the meantime
 * can leave a card pointing at a line that has moved or changed. Refusing the
 * write is the only safe answer: guessing at the nearest line risks marking the
 * wrong one, and marking the wrong line is worse than not marking any.
 */
export class StaleQuestionError extends Error {
  constructor(notePath: string) {
    super(`The line this question was read from has changed in ${notePath}`);
    this.name = "StaleQuestionError";
  }
}

/**
 * The line holding this question, by number when it is still there and by its
 * exact text when it has only moved.
 */
function findQuestionLine(lines: string[], question: OpenQuestion): number {
  if (lines[question.line] === question.rawLine) return question.line;
  return lines.indexOf(question.rawLine);
}

/**
 * Marks a question answered on the given day, or open again when passed null.
 *
 * Returns the line as written, so the caller can hold on to a question that
 * still knows what it looks like in the vault — an undo written against a stale
 * line would fail the same identity check this one just passed.
 */
export async function setOpenQuestionResolved(
  app: App,
  question: OpenQuestion,
  resolvedOn: string | null
): Promise<string> {
  const file = app.vault.getFileByPath(question.notePath);
  if (!(file instanceof TFile)) throw new StaleQuestionError(question.notePath);

  // Held in an object so the assignment inside the callback survives
  // TypeScript's control-flow narrowing
  const written: { line: string | null } = { line: null };

  await app.vault.process(file, (content) => {
    const eol = content.includes("\r\n") ? "\r\n" : "\n";
    const lines = content.split(/\r?\n/);

    const index = findQuestionLine(lines, question);
    if (index === -1) return content;

    const line = writeResolvedToLine(lines[index], resolvedOn);
    lines[index] = line;
    written.line = line;
    return lines.join(eol);
  });

  if (written.line === null) throw new StaleQuestionError(question.notePath);

  return written.line;
}
