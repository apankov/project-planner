import { App } from "./mocks/obsidian";
import { DataviewTask } from "../src/types/dataview-task";
import { TaskFinance } from "../src/lib/task-finance";

/**
 * Where a property lands once a task has a note.
 *
 * The rule under test throughout: the note is the store, so a task with one
 * writes there and the line has the matching field taken off — two places
 * holding one fact is two places to disagree. Dates are the deliberate
 * exception, mirrored onto the line so the Tasks plugin still sees them.
 */

const NOTE_PATH = "Tasks/Fit the loom.md";
const LIST_PATH = "tasks/list.md";

const FINANCE: TaskFinance = {
  hoursPerDay: null,
  totalHours: 48,
  allocations: [
    { person: "Alice", share: 0.6 },
    { person: "Bob", share: 0.4 },
  ],
  expenses: [],
};

describe("a task whose line links to a note", () => {
  let app: App;

  beforeEach(() => {
    app = new App();
    app.vault.setFileContent(
      NOTE_PATH,
      "---\ntask-note: true\n---\n\n# Loom\n"
    );
    app.vault.setFileContent(LIST_PATH, "- [ ] [[Fit the loom]] 🆔 abc123");
  });

  function task(): DataviewTask {
    return new DataviewTask({
      id: "abc123",
      summary: "[[Fit the loom]]",
      text: "[[Fit the loom]] 🆔 abc123",
      tags: [],
      status: "todo",
      priority: "",
      link: LIST_PATH,
      incomingLinks: [],
      starred: false,
    });
  }

  function note(): string {
    return app.vault.getFileContent(NOTE_PATH);
  }

  function line(): string {
    return app.vault.getFileContent(LIST_PATH);
  }

  it("writes the owner to the note, not the line", async () => {
    const updated = await task().setOwner("Alice", app as never);

    expect(note()).toContain("owner: Alice");
    expect(line()).toBe("- [ ] [[Fit the loom]] 🆔 abc123");
    expect(updated?.owner).toBe("Alice");
  });

  it("writes the costing to the note, not the line", async () => {
    await task().setFinance(FINANCE, app as never);

    expect(note()).toContain("hours: 48");
    expect(note()).toContain("person: Alice");
    expect(line()).not.toContain("people::");
    expect(line()).not.toContain("hours::");
  });

  it("writes progress to the note, not the line", async () => {
    const updated = await task().setProgress(35, app as never);

    expect(note()).toContain("progress: 35");
    expect(line()).not.toContain("progress::");
    expect(updated?.progress).toEqual({ percent: 35 });
  });

  it("writes the parent to the note, not the line", async () => {
    await task().setParent("xyz789", app as never);

    expect(note()).toContain("parent: xyz789");
    expect(line()).not.toContain("parent::");
  });

  it("mirrors dates onto the line as well, so Tasks still sees them", async () => {
    await task().setDates({ due: "2026-09-04" }, app as never);

    expect(note()).toContain("due: 2026-09-04");
    expect(line()).toContain("2026-09-04");
  });

  it("takes a field off the line when the note takes it over", async () => {
    // A task that carried its owner inline before it had a note
    app.vault.setFileContent(
      LIST_PATH,
      "- [ ] [[Fit the loom]] 🆔 abc123 [owner:: Bob]"
    );

    await task().setOwner("Alice", app as never);

    expect(line()).not.toContain("owner::");
    expect(note()).toContain("owner: Alice");
  });

  it("leaves the rest of the line untouched", async () => {
    app.vault.setFileContent(
      LIST_PATH,
      "- [ ] [[Fit the loom]] 🆔 abc123 ⛔ d4e5f6 #shop"
    );

    await task().setOwner("Alice", app as never);

    expect(line()).toContain("🆔 abc123");
    expect(line()).toContain("⛔ d4e5f6");
    expect(line()).toContain("#shop");
  });

  it("clears a property from the note", async () => {
    await task().setOwner("Alice", app as never);
    const updated = await task().setOwner(null, app as never);

    expect(note()).not.toContain("owner:");
    expect(updated?.owner).toBeNull();
  });

  it("returns a task that is still a task, methods and all", async () => {
    const updated = await task().setOwner("Alice", app as never);

    expect(updated).toBeInstanceOf(DataviewTask);
    expect(updated?.id).toBe("abc123");
    expect(updated?.summary).toBe("[[Fit the loom]]");
  });
});

describe("a task with no note", () => {
  let app: App;

  beforeEach(() => {
    app = new App();
    app.vault.setFileContent(LIST_PATH, "- [ ] Fit the loom 🆔 abc123");
  });

  function task(): DataviewTask {
    return new DataviewTask({
      id: "abc123",
      summary: "Fit the loom",
      text: "Fit the loom 🆔 abc123",
      tags: [],
      status: "todo",
      priority: "",
      link: LIST_PATH,
      incomingLinks: [],
      starred: false,
    });
  }

  it("keeps writing the owner to the line", async () => {
    const updated = await task().setOwner("Alice", app as never);

    expect(app.vault.getFileContent(LIST_PATH)).toBe(
      "- [ ] Fit the loom 🆔 abc123 [owner:: Alice]"
    );
    expect(updated?.owner).toBe("Alice");
  });

  it("keeps writing progress to the line", async () => {
    await task().setProgress(35, app as never);

    expect(app.vault.getFileContent(LIST_PATH)).toContain("[progress:: 35]");
  });

  it("does not invent a note for a link that is not one", async () => {
    // The task links to an ordinary note, which is not a property store
    app.vault.setFileContent("Design doc.md", "---\ntitle: Design\n---\n");
    app.vault.setFileContent(
      LIST_PATH,
      "- [ ] Read the [[Design doc]] 🆔 abc123"
    );

    const linked = new DataviewTask({
      id: "abc123",
      summary: "Read the [[Design doc]]",
      text: "Read the [[Design doc]] 🆔 abc123",
      tags: [],
      status: "todo",
      priority: "",
      link: LIST_PATH,
      incomingLinks: [],
      starred: false,
    });

    await linked.setOwner("Alice", app as never);

    expect(app.vault.getFileContent(LIST_PATH)).toContain("[owner:: Alice]");
    expect(app.vault.getFileContent("Design doc.md")).not.toContain("owner");
  });
});
