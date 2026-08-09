/**
 * Reading and writing the parent metadata on a task.
 *
 * A task can sit inside another one — "redesign" holding the dozen tasks that
 * make up the redesign — and the relationship is stored on the *child*: it
 * names its parent by task ID. Inline tasks carry it as a Dataview field on
 * the task line (`[parent:: a1b2c3]`); note-based tasks carry it as a
 * `parent:` frontmatter key. Both end up as one `parentId` string so the rest
 * of the plugin does not care where it came from.
 *
 * Storing the link on the child rather than keeping a list of children on the
 * parent is what makes adding a child a one-line edit, and it makes the two
 * halves of a relationship incapable of disagreeing: there is only ever one
 * place that says who a task belongs to.
 *
 * The inline field ends at the first closing bracket, the same way every other
 * Dataview field in this plugin does. A note task is keyed by its path, so an
 * inline child of a note whose filename contains a bracket cannot name it on
 * one line — that note's own `parent:` frontmatter has no such limit, and
 * making this one field uniquely clever would only make the rules harder to
 * remember.
 *
 * Nothing here checks that the parent exists, that it is not the task itself,
 * or that the chain does not loop. A vault is hand-edited text and any of
 * those can be written into it; sorting that out belongs to `task-hierarchy`,
 * which is the one place that has the whole set of tasks to judge it against.
 */

import {
  PARENT_FIELD_NAMES,
  PARENT_FIELD_PATTERN,
  PARENT_FIELD_REMOVAL,
} from "./task-regex";

/** Every accepted spelling, canonical first. */
export const PARENT_FIELDS = PARENT_FIELD_NAMES.split("|");

/** The field name written back to the vault. */
const CANONICAL_FIELD = PARENT_FIELDS[0];

/**
 * A parent ID as the plugin holds it: trimmed, with the wrapping a link or a
 * quoted YAML scalar leaves behind taken off, and empty read as "no parent".
 *
 * `[[Redesign]]` is tolerated because it is what someone reaching for an
 * Obsidian link will type. It resolves only when a task's ID really is that
 * text — note tasks are keyed by path — but keeping the brackets would mean it
 * could never resolve at all.
 */
export function normalizeParentId(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;

  const unwrapped = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/^\[\[(.*)\]\]$/, "$1")
    .trim();

  return unwrapped.length > 0 ? unwrapped : null;
}

/** The parent named on an inline task line, or null when it names none. */
export function getTaskParentId(taskText: string): string | null {
  const match = taskText.match(PARENT_FIELD_PATTERN);
  return match ? normalizeParentId(match[1]) : null;
}

/**
 * Rewrites a task line to name exactly this parent: any existing parent field
 * goes, and a canonical one is appended when there is a value. Every other
 * piece of metadata on the line — dates, tags, id, finance, progress,
 * dependencies — is untouched.
 */
export function writeParentToTaskLine(
  taskLine: string,
  parentId: string | null
): string {
  const stripped = taskLine
    .replace(PARENT_FIELD_REMOVAL, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+$/, "");

  const id = normalizeParentId(parentId);
  if (id === null) return stripped;

  return `${stripped} [${CANONICAL_FIELD}:: ${id}]`;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The parent named in a note's frontmatter. Only strings mean anything here —
 * a task ID is text — so a `parent:` holding a list or a number reads as no
 * parent rather than as a stringified accident.
 */
export function getFrontmatterParentId(
  frontmatter: Record<string, unknown>
): string | null {
  for (const name of PARENT_FIELDS) {
    const value = frontmatter[name];
    if (typeof value !== "string") continue;

    const id = normalizeParentId(value);
    if (id !== null) return id;
  }

  return null;
}

/**
 * What to change in a note's frontmatter to make it name this parent.
 * `remove` covers every accepted spelling, so a note that used `parentId`
 * cannot keep it around contradicting the `parent` just written.
 */
export function parentFrontmatterPatch(parentId: string | null): {
  set: Record<string, unknown>;
  remove: string[];
} {
  const id = normalizeParentId(parentId);
  const set: Record<string, unknown> = {};

  if (id !== null) set[CANONICAL_FIELD] = id;

  const remove = PARENT_FIELDS.filter((name) => set[name] === undefined);

  return { set, remove };
}
