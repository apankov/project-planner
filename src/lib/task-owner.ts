/**
 * Reading and writing the owner metadata on a task.
 *
 * A task's owner is the one person answerable for it. That is a different
 * question from who does the work — a task can be owned by one person and
 * worked by three, which is why the owner is its own field rather than the
 * first entry in `[people:: …]`. Costing reads the contributors; a board
 * grouped by owner reads this.
 *
 * Inline tasks carry it as a Dataview field on the task line
 * (`[owner:: Alice]`); tasks with a note carry it as an `owner:` frontmatter
 * key. Both end up as one string so the rest of the plugin does not care where
 * it came from.
 *
 * `[[Alice]]` is accepted on read and resolved to what the reader sees, the
 * same way `task-finance` resolves a linked person's name — people reach for a
 * link when naming a person in Obsidian. It is written back as plain text,
 * because that is how contributor names are written and one field spelling
 * people differently from the field beside it is a trap.
 */

import {
  OWNER_FIELD_NAMES,
  OWNER_FIELD_PATTERN,
  OWNER_FIELD_REMOVAL,
} from "./task-regex";

/** Every accepted spelling, canonical first. */
export const OWNER_FIELDS = OWNER_FIELD_NAMES.split("|");

/** The field name written back to the vault. */
const CANONICAL_FIELD = OWNER_FIELDS[0];

/**
 * An owner as the plugin holds it: trimmed, with the wrapping a link or a
 * quoted YAML scalar leaves behind taken off, and empty read as "no owner".
 *
 * A link resolves to its display text, or to the note's own name when it
 * points into a folder — `[[People/Alice]]` is Alice, not People/Alice — so a
 * linked owner and a typed one match the same rate-book entry.
 */
export function normalizeOwner(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;

  const unwrapped = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, path, alias) =>
      alias ? alias : String(path).split("/").pop()
    )
    .replace(/\s+/g, " ")
    .trim();

  return unwrapped.length > 0 ? unwrapped : null;
}

/** The owner named on an inline task line, or null when it names none. */
export function getTaskOwner(taskText: string): string | null {
  const match = taskText.match(OWNER_FIELD_PATTERN);
  return match ? normalizeOwner(match[1]) : null;
}

/**
 * Rewrites a task line to name exactly this owner: any existing owner field
 * goes, and a canonical one is appended when there is a value. Every other
 * piece of metadata on the line — dates, tags, id, finance, progress,
 * dependencies — is untouched.
 */
export function writeOwnerToTaskLine(
  taskLine: string,
  owner: string | null
): string {
  const stripped = taskLine
    .replace(OWNER_FIELD_REMOVAL, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+$/, "");

  const name = normalizeOwner(owner);
  if (name === null) return stripped;

  return `${stripped} [${CANONICAL_FIELD}:: ${name}]`;
}

/* -------------------------------------------------------------------------- */
/* Frontmatter                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The owner named in a note's frontmatter. Only strings mean anything here — a
 * person is a name — so an `owner:` holding a list reads as no owner rather
 * than as a stringified accident. A one-entry list is the exception, because
 * that is what Obsidian's own properties editor writes when a key was ever a
 * list.
 */
export function getFrontmatterOwner(
  frontmatter: Record<string, unknown>
): string | null {
  for (const name of OWNER_FIELDS) {
    const value = frontmatter[name];

    if (typeof value === "string") {
      const owner = normalizeOwner(value);
      if (owner !== null) return owner;
      continue;
    }

    if (Array.isArray(value) && value.length === 1) {
      const owner =
        typeof value[0] === "string" ? normalizeOwner(value[0]) : null;
      if (owner !== null) return owner;
    }
  }

  return null;
}

/**
 * What to change in a note's frontmatter to make it name this owner. `remove`
 * covers every accepted spelling, so a note that used `assignee` cannot keep it
 * around contradicting the `owner` just written.
 */
export function ownerFrontmatterPatch(owner: string | null): {
  set: Record<string, unknown>;
  remove: string[];
} {
  const name = normalizeOwner(owner);
  const set: Record<string, unknown> = {};

  if (name !== null) set[CANONICAL_FIELD] = name;

  const remove = OWNER_FIELDS.filter((field) => set[field] === undefined);

  return { set, remove };
}
