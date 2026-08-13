import { App } from "./mocks/obsidian";
import { DataviewTask } from "../src/types/dataview-task";
import { migrateTaskPropertiesToNote } from "../src/lib/companion-note-retrofit";

/**
 * Moving an existing task's properties off its line and into its note.
 *
 * The line is left with what the line is good at — the checkbox, the link, the
 * id and the dates the Tasks plugin reads there — and everything else is in the
 * note, which is where the editor now writes it.
 */

const NOTE_PATH = "Tasks/Fit the loom.md";
const LIST_PATH = "tasks/list.md";

function task(text: string): DataviewTask {
  return new DataviewTask({
    id: "abc123",
    summary: text.replace(/\s*🆔\s*\S+/, ""),
    text,
    tags: ["shop"],
    status: "todo",
    priority: "",
    link: LIST_PATH,
    incomingLinks: [],
    starred: false,
    dates: [
      { type: "start", date: "2026-08-17" },
      { type: "due", date: "2026-09-04" },
    ],
    finance: {
      hoursPerDay: null,
      totalHours: 48,
      allocations: [{ person: "Alice", share: 0.6 }],
      expenses: [],
    },
    progress: { percent: 35 },
    owner: "Alice",
    parentId: "xyz789",
  });
}

describe("migrateTaskPropertiesToNote", () => {
  let app: App;

  beforeEach(() => {
    app = new App();
    app.vault.setFileContent(
      NOTE_PATH,
      "---\ntask-note: true\n---\n\n# Loom\n"
    );
  });

  function note(): string {
    return app.vault.getFileContent(NOTE_PATH);
  }

  function line(): string {
    return app.vault.getFileContent(LIST_PATH);
  }

  it("writes every property into the note", async () => {
    const text =
      "[[Fit the loom]] 🆔 abc123 [hours:: 48] [people:: Alice 60%] " +
      "[progress:: 35] [owner:: Alice] [parent:: xyz789]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    const moved = await migrateTaskPropertiesToNote(app as never, task(text));

    expect(moved).toBe(true);
    expect(note()).toContain("hours: 48");
    expect(note()).toContain("person: Alice");
    expect(note()).toContain("progress: 35");
    expect(note()).toContain("owner: Alice");
    expect(note()).toContain("parent: xyz789");
    expect(note()).toContain("start: 2026-08-17");
    expect(note()).toContain("due: 2026-09-04");
  });

  it("takes those fields off the line", async () => {
    const text =
      "[[Fit the loom]] 🆔 abc123 [hours:: 48] [people:: Alice 60%] " +
      "[progress:: 35] [owner:: Alice] [parent:: xyz789]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    await migrateTaskPropertiesToNote(app as never, task(text));

    expect(line()).not.toContain("hours::");
    expect(line()).not.toContain("people::");
    expect(line()).not.toContain("progress::");
    expect(line()).not.toContain("owner::");
    expect(line()).not.toContain("parent::");
  });

  it("leaves the checkbox, the link and the id alone", async () => {
    const text = "[[Fit the loom]] 🆔 abc123 [hours:: 48]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    await migrateTaskPropertiesToNote(app as never, task(text));

    expect(line()).toContain("- [ ]");
    expect(line()).toContain("[[Fit the loom]]");
    expect(line()).toContain("🆔 abc123");
  });

  it("never writes the task tag into the note", async () => {
    // A companion note carrying it would be drawn as a second node
    const text = "[[Fit the loom]] 🆔 abc123 [hours:: 48]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    const tagged = task(text);
    tagged.tags = ["task", "shop"];

    await migrateTaskPropertiesToNote(app as never, tagged);

    expect(note()).toContain("shop");
    expect(note()).not.toMatch(/^\s+- task$/m);
  });

  it("is safe to run twice", async () => {
    const text = "[[Fit the loom]] 🆔 abc123 [hours:: 48] [owner:: Alice]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    await migrateTaskPropertiesToNote(app as never, task(text));
    const afterFirst = note();
    const lineAfterFirst = line();

    await migrateTaskPropertiesToNote(app as never, task(text));

    expect(note()).toBe(afterFirst);
    expect(line()).toBe(lineAfterFirst);
  });

  it("does nothing for a task with no note", async () => {
    const text = "Fit the loom 🆔 abc123 [hours:: 48]";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    const moved = await migrateTaskPropertiesToNote(app as never, task(text));

    expect(moved).toBe(false);
    expect(line()).toContain("[hours:: 48]");
  });

  it("does nothing for a task that carries no properties", async () => {
    const text = "[[Fit the loom]] 🆔 abc123";
    app.vault.setFileContent(LIST_PATH, `- [ ] ${text}`);

    const bare = new DataviewTask({
      id: "abc123",
      summary: "[[Fit the loom]]",
      text,
      tags: [],
      status: "todo",
      priority: "",
      link: LIST_PATH,
      incomingLinks: [],
      starred: false,
    });

    expect(await migrateTaskPropertiesToNote(app as never, bare)).toBe(false);
    expect(note()).toBe("---\ntask-note: true\n---\n\n# Loom\n");
  });
});
