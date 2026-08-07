import { DataviewTask } from "../src/types/dataview-task";
import { NoteTask } from "../src/types/note-task";
import {
  findTasksNeedingNotes,
  taskAlreadyLinked,
} from "../src/lib/companion-note-retrofit";

function makeInlineTask(
  overrides: Partial<ConstructorParameters<typeof DataviewTask>[0]> = {}
): DataviewTask {
  return new DataviewTask({
    id: "abc123",
    summary: "Spec Batteries",
    text: "Spec Batteries 🆔 abc123",
    tags: [],
    status: "todo",
    priority: "",
    link: "Kohtari/Task List.md",
    incomingLinks: [],
    starred: false,
    projects: [],
    dates: [],
    ...overrides,
  });
}

function makeNoteTask(): NoteTask {
  return new NoteTask({
    id: "Tasks/Thing.md",
    summary: "Thing",
    text: "Thing",
    tags: ["task"],
    status: "todo",
    priority: "",
    link: "Tasks/Thing.md",
    incomingLinks: [],
    starred: false,
    projects: [],
    dates: [],
  });
}

describe("taskAlreadyLinked", () => {
  it("spots a task whose text is a wikilink", () => {
    expect(taskAlreadyLinked(makeInlineTask({ summary: "[[Review]]" }))).toBe(
      true
    );
  });

  it("spots a link in the middle of the text", () => {
    expect(
      taskAlreadyLinked(makeInlineTask({ summary: "Review [[Gen1]] again" }))
    ).toBe(true);
  });

  it("reports a plain task as unlinked", () => {
    expect(taskAlreadyLinked(makeInlineTask())).toBe(false);
  });
});

describe("findTasksNeedingNotes", () => {
  it("includes a plain inline task", () => {
    const task = makeInlineTask();
    expect(findTasksNeedingNotes([task])).toEqual([task]);
  });

  it("leaves already-linked tasks alone", () => {
    const task = makeInlineTask({ summary: "[[Spec Batteries]]" });
    expect(findTasksNeedingNotes([task])).toEqual([]);
  });

  it("leaves note-based tasks alone, since they are their own note", () => {
    expect(findTasksNeedingNotes([makeNoteTask()])).toEqual([]);
  });

  it("skips a task with no usable name", () => {
    const task = makeInlineTask({ summary: "   " });
    expect(findTasksNeedingNotes([task])).toEqual([]);
  });

  it("skips a task with no file behind it", () => {
    const task = makeInlineTask({ link: "" });
    expect(findTasksNeedingNotes([task])).toEqual([]);
  });

  it("picks only the tasks that need work from a mixed set", () => {
    const plain = makeInlineTask({ id: "a", summary: "Order parts" });
    const linked = makeInlineTask({ id: "b", summary: "[[Cut steel]]" });
    const note = makeNoteTask();

    expect(findTasksNeedingNotes([plain, linked, note])).toEqual([plain]);
  });

  it("returns nothing for an empty vault", () => {
    expect(findTasksNeedingNotes([])).toEqual([]);
  });
});
