import { App } from "./mocks/obsidian";
import { DataviewTask } from "../src/types/dataview-task";
import { NoteTask } from "../src/types/note-task";
import {
  companionNoteFor,
  firstWikiLink,
  isTaskNoteFrontmatter,
  noteStatusValue,
  readTaskNoteProperties,
  statusFromNoteValue,
  taskNotePatch,
  withNoteProperties,
} from "../src/lib/task-note";

function makeTask(text: string): DataviewTask {
  return new DataviewTask({
    id: "abc123",
    summary: text.replace(/^- \[ \] /, "").replace(/\s*🆔\s*\S+/, ""),
    text,
    tags: [],
    status: "todo",
    priority: "",
    link: "tasks/list.md",
    incomingLinks: [],
    starred: false,
  });
}

describe("firstWikiLink", () => {
  it("finds a plain link", () => {
    expect(firstWikiLink("[[Fit the loom]]")).toBe("Fit the loom");
  });

  it("takes the target of an aliased link, not the alias", () => {
    // The alias is what the reader sees; the target is what resolves to a file
    expect(firstWikiLink("[[Tasks/Fit the loom|the loom]]")).toBe(
      "Tasks/Fit the loom"
    );
  });

  it("drops a heading or block reference", () => {
    expect(firstWikiLink("[[Fit the loom#Notes]]")).toBe("Fit the loom");
  });

  it("takes the first of several", () => {
    expect(firstWikiLink("[[One]] and [[Two]]")).toBe("One");
  });

  it("finds nothing in text with no link", () => {
    expect(firstWikiLink("Fit the loom")).toBeNull();
  });
});

describe("isTaskNoteFrontmatter", () => {
  it("accepts a note carrying the marker", () => {
    expect(isTaskNoteFrontmatter({ "task-note": true })).toBe(true);
  });

  it("refuses a note without one", () => {
    expect(isTaskNoteFrontmatter({ title: "Design doc" })).toBe(false);
    expect(isTaskNoteFrontmatter(undefined)).toBe(false);
  });

  it("refuses a marker that is not literally true", () => {
    expect(isTaskNoteFrontmatter({ "task-note": "yes" })).toBe(false);
  });

  it("refuses a note that is already a task in its own right", () => {
    // Writing here would have two tasks fighting over one file
    expect(isTaskNoteFrontmatter({ "task-note": true, tags: ["task"] })).toBe(
      false
    );
    expect(isTaskNoteFrontmatter({ "task-note": true, tags: "#task" })).toBe(
      false
    );
  });
});

describe("companionNoteFor", () => {
  let app: App;

  beforeEach(() => {
    app = new App();
  });

  it("finds the note a task's line links to", () => {
    app.vault.setFileContent(
      "Tasks/Fit the loom.md",
      "---\ntask-note: true\n---\n"
    );

    const note = companionNoteFor(app as never, makeTask("[[Fit the loom]]"));

    expect(note?.path).toBe("Tasks/Fit the loom.md");
  });

  it("refuses an ordinary note the task happens to link to", () => {
    // Without this a task mentioning a design doc would write hours into it
    app.vault.setFileContent("Design doc.md", "---\ntitle: Design\n---\n");

    expect(
      companionNoteFor(app as never, makeTask("Read the [[Design doc]]"))
    ).toBeNull();
  });

  it("finds nothing for a task with no link", () => {
    expect(companionNoteFor(app as never, makeTask("Fit the loom"))).toBeNull();
  });

  it("finds nothing for a note task, which is its own note", () => {
    const note = new NoteTask({
      id: "notes/loom.md",
      summary: "[[Something else]]",
      text: "Loom",
      tags: ["task"],
      status: "todo",
      priority: "",
      link: "notes/loom.md",
      incomingLinks: [],
      starred: false,
    });

    expect(companionNoteFor(app as never, note)).toBeNull();
  });
});

describe("status round-tripping", () => {
  it.each([
    ["todo", "open"],
    ["in_progress", "in-progress"],
    ["done", "done"],
    ["canceled", "canceled"],
  ] as const)("writes %s as %s", (status, written) => {
    expect(noteStatusValue(status)).toBe(written);
  });

  it.each([
    ["open", "todo"],
    ["in-progress", "in_progress"],
    ["in progress", "in_progress"],
    ["done", "done"],
    ["completed", "done"],
    ["cancelled", "canceled"],
  ] as const)("reads %s as %s", (written, status) => {
    expect(statusFromNoteValue(written)).toBe(status);
  });

  it("reads an unknown value as no answer, leaving the checkbox to decide", () => {
    expect(statusFromNoteValue("halfway")).toBeNull();
    expect(statusFromNoteValue(42)).toBeNull();
  });
});

describe("readTaskNoteProperties", () => {
  it("reads every property a note can carry", () => {
    const properties = readTaskNoteProperties({
      "task-note": true,
      status: "in-progress",
      start: "2026-08-17",
      due: "2026-09-04",
      owner: "Alice",
      people: [{ person: "Alice", share: 60 }],
      hours: 48,
      progress: 35,
      parent: "xyz789",
      dependsOn: ["d4e5f6"],
      tags: ["export", "shop"],
    });

    expect(properties.status).toBe("in_progress");
    expect(properties.dates).toEqual([
      { type: "due", date: "2026-09-04" },
      { type: "start", date: "2026-08-17" },
    ]);
    expect(properties.owner).toBe("Alice");
    expect(properties.finance.allocations).toEqual([
      { person: "Alice", share: 0.6 },
    ]);
    expect(properties.finance.totalHours).toBe(48);
    expect(properties.progress).toEqual({ percent: 35 });
    expect(properties.parentId).toBe("xyz789");
    expect(properties.incomingLinks).toEqual(["d4e5f6"]);
    expect(properties.tags).toEqual(["export", "shop"]);
  });

  it("never reports the task tag, which is not the task's own tag", () => {
    const properties = readTaskNoteProperties({ tags: ["task", "shop"] });
    expect(properties.tags).toEqual(["shop"]);
  });

  it("reads an empty note as saying nothing", () => {
    const properties = readTaskNoteProperties({ "task-note": true });

    expect(properties.dates).toEqual([]);
    expect(properties.owner).toBeNull();
    expect(properties.status).toBeNull();
    expect(properties.progress).toEqual({ percent: null });
  });
});

describe("taskNotePatch", () => {
  it("writes a date under its canonical key", () => {
    const { set } = taskNotePatch({ dates: { due: "2026-09-04" } });
    expect(set).toEqual({ due: "2026-09-04" });
  });

  it("removes every spelling of a date it clears", () => {
    // A note written with `dueDate:` must not keep the date just cleared
    const { remove } = taskNotePatch({ dates: { due: null } });
    expect(remove).toContain("due");
    expect(remove).toContain("dueDate");
  });

  it("removes the other spellings of a date it sets", () => {
    const { set, remove } = taskNotePatch({ dates: { due: "2026-09-04" } });
    expect(set.due).toBe("2026-09-04");
    expect(remove).toContain("dueDate");
    expect(remove).not.toContain("due");
  });

  it("filters the task tag out of anything it writes", () => {
    const { set } = taskNotePatch({ tags: ["task", "shop"] });
    expect(set.tags).toEqual(["shop"]);
  });

  it("takes the tags key off when the last tag goes", () => {
    const { set, remove } = taskNotePatch({ tags: [] });
    expect(set.tags).toBeUndefined();
    expect(remove).toContain("tags");
  });

  it("writes dependencies as a list of ids", () => {
    const { set } = taskNotePatch({ incomingLinks: ["d4e5f6", "a1b2c3"] });
    expect(set.dependsOn).toEqual(["d4e5f6", "a1b2c3"]);
  });

  it("writes status in the note's own spelling", () => {
    const { set } = taskNotePatch({ status: "in_progress" });
    expect(set.status).toBe("in-progress");
  });

  it("merges a whole edit into one patch", () => {
    const { set } = taskNotePatch({
      dates: { start: "2026-08-17" },
      owner: "Alice",
      progress: { percent: 35 },
      status: "in_progress",
    });

    expect(set).toEqual({
      start: "2026-08-17",
      owner: "Alice",
      progress: 35,
      status: "in-progress",
    });
  });

  it("never removes a key the same patch sets", () => {
    const { set, remove } = taskNotePatch({
      dates: { due: "2026-09-04" },
      owner: "Alice",
    });

    for (const key of remove) {
      expect(set[key]).toBeUndefined();
    }
  });
});

describe("withNoteProperties", () => {
  const properties = readTaskNoteProperties({
    start: "2026-08-17",
    owner: "Alice",
    progress: 35,
    hours: 48,
    status: "done",
    tags: ["export"],
  });

  it("lays the note's answers over the line's", () => {
    const merged = withNoteProperties(makeTask("[[Fit the loom]]"), properties);

    expect(merged.owner).toBe("Alice");
    expect(merged.progress).toEqual({ percent: 35 });
    expect(merged.finance.totalHours).toBe(48);
    expect(merged.dates).toEqual([{ type: "start", date: "2026-08-17" }]);
  });

  it("leaves status to the checkbox", () => {
    // The note says done; the box is unticked, and the box is the fast edit
    const merged = withNoteProperties(makeTask("[[Fit the loom]]"), properties);
    expect(merged.status).toBe("todo");
  });

  it("keeps the task a real task, methods and all", () => {
    const merged = withNoteProperties(makeTask("[[Fit the loom]]"), properties);

    expect(merged).toBeInstanceOf(DataviewTask);
    expect(typeof merged.setOwner).toBe("function");
    expect(merged.type).toBe("dataview");
  });

  it("adds the note's tags to the line's rather than replacing them", () => {
    const task = makeTask("[[Fit the loom]] #shop");
    task.tags = ["shop"];

    const merged = withNoteProperties(task, properties);

    expect(merged.tags.sort()).toEqual(["export", "shop"]);
  });

  it("leaves a field the note says nothing about alone", () => {
    const task = makeTask("[[Fit the loom]]");
    task.owner = "Bob";

    const merged = withNoteProperties(task, readTaskNoteProperties({}));

    expect(merged.owner).toBe("Bob");
  });
});
