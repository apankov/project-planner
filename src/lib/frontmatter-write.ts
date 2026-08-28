/**
 * Reading and writing a note's frontmatter.
 *
 * Both kinds of task keep their properties in frontmatter now: a note task in
 * its own note, an inline task in the companion note its line links to. The
 * read-mutate-write dance was `NoteTask`'s private method; it is lifted here so
 * `DataviewTask` uses the same one, because two implementations of this would
 * be two different ways for a save to go wrong.
 *
 * Obsidian's `fileManager.processFrontMatter` does a similar job. This stays
 * hand-rolled because it is what every existing note-task write already goes
 * through, and because it reports whether it wrote anything — the callers all
 * return null on a miss rather than pretending a write happened.
 */

import { App, TFile, parseYaml, stringifyYaml } from "obsidian";

/**
 * A change to frontmatter: keys to write, and every other spelling of those
 * keys to take away. `remove` is what stops a note that said `estimatedHours`
 * from keeping it around contradicting the `hours` just written.
 */
export interface FrontmatterPatch {
  set: Record<string, unknown>;
  remove: string[];
}

/**
 * Frontmatter as YAML hands it back. `parseYaml` is typed `any`, and the
 * content is whatever the user wrote, so the shape is a hope rather than a
 * fact. Narrowing it to a record once, here, keeps every caller from reaching
 * through `any` to read it — including a document that parses to a bare string
 * or a list, which is not frontmatter and is treated as none.
 */
export type FrontmatterRecord = Record<string, unknown>;

export function parseFrontmatterRecord(yaml: string): FrontmatterRecord {
  const parsed: unknown = parseYaml(yaml);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as FrontmatterRecord)
    : {};
}

/** Where a note's frontmatter block starts and ends, or -1 for neither. */
export function findFrontmatter(lines: string[]): {
  frontmatterStart: number;
  frontmatterEnd: number;
} {
  let frontmatterStart = -1;
  let frontmatterEnd = -1;

  if (lines[0] === "---") {
    frontmatterStart = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        frontmatterEnd = i;
        break;
      }
    }
  }

  return { frontmatterStart, frontmatterEnd };
}

/** Applies a patch in place: removals first, so a rename cannot lose the value. */
export function applyFrontmatterPatch(
  frontmatter: Record<string, unknown>,
  patch: FrontmatterPatch
): void {
  for (const key of patch.remove) delete frontmatter[key];
  Object.assign(frontmatter, patch.set);
}

/** Merges several patches into one, so a whole edit is a single write. */
export function mergeFrontmatterPatches(
  patches: FrontmatterPatch[]
): FrontmatterPatch {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  for (const patch of patches) {
    Object.assign(set, patch.set);
    remove.push(...patch.remove);
  }

  // A key one patch sets must not be removed by another's clean-up list
  return { set, remove: remove.filter((key) => set[key] === undefined) };
}

/**
 * Reads a note's frontmatter, hands it to `mutate`, and writes back what that
 * leaves behind. Returns false when there was nothing to write to.
 *
 * A note with no frontmatter block is left alone rather than given one. Both
 * callers identify their notes *by* frontmatter — a note task by its `task`
 * tag, a companion note by its `task-note` marker — so a note without any is
 * not a note either of them owns, and writing properties into it would be
 * writing into a stranger's file.
 */
export async function updateFrontmatter(
  app: App,
  file: TFile,
  // eslint-disable-next-line no-unused-vars -- a callback's parameter name
  mutate: (frontmatter: Record<string, unknown>) => void
): Promise<boolean> {
  const vault = app?.vault;
  if (!vault) return false;

  let wrote = false;

  await vault.process(file, (fileContent) => {
    const lines = fileContent.split(/\r?\n/);
    const { frontmatterStart, frontmatterEnd } = findFrontmatter(lines);

    if (frontmatterStart === -1 || frontmatterEnd === -1) {
      return fileContent;
    }

    const frontmatterYaml = lines
      .slice(frontmatterStart + 1, frontmatterEnd)
      .join("\n");
    const bodyContent = lines.slice(frontmatterEnd + 1).join("\n");
    const frontmatterData = parseFrontmatterRecord(frontmatterYaml);

    mutate(frontmatterData);

    wrote = true;
    return `---\n${stringifyYaml(frontmatterData)}---\n${bodyContent}`;
  });

  return wrote;
}

/** `updateFrontmatter` for the common case of applying one patch. */
export function writeFrontmatterPatch(
  app: App,
  file: TFile,
  patch: FrontmatterPatch
): Promise<boolean> {
  return updateFrontmatter(app, file, (frontmatter) => {
    applyFrontmatterPatch(frontmatter, patch);
  });
}
