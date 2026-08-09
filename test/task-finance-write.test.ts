import { Vault, App } from "./mocks/obsidian";
import { DataviewTask } from "../src/types/dataview-task";
import { NoteTask } from "../src/types/note-task";
import { EMPTY_TASK_FINANCE, TaskFinance } from "../src/lib/task-finance";

const FINANCE: TaskFinance = {
  hoursPerDay: 6,
  totalHours: null,
  allocations: [
    { person: "Alice Smith", share: 0.6 },
    { person: "Bob Jones", share: 0.4 },
  ],
  expenses: [{ description: "Loom kit", amount: 240 }],
};

describe("DataviewTask.setFinance", () => {
  let vault: Vault;
  let app: App;

  beforeEach(() => {
    app = new App();
    vault = app.vault;
  });

  function makeTask(text = "Fit the loom 🆔 abc123"): DataviewTask {
    return new DataviewTask({
      id: "abc123",
      summary: "Fit the loom",
      text,
      tags: [],
      status: "todo",
      priority: "",
      link: "tasks/test.md",
      incomingLinks: [],
      starred: false,
    });
  }

  it("writes the fields onto the line", async () => {
    vault.setFileContent("tasks/test.md", "- [ ] Fit the loom 🆔 abc123");

    await makeTask().setFinance(FINANCE, app);

    expect(vault.getFileContent("tasks/test.md")).toBe(
      "- [ ] Fit the loom 🆔 abc123 [hoursPerDay:: 6] " +
        "[people:: Alice Smith 60%, Bob Jones 40%] [costs:: Loom kit 240]"
    );
  });

  it("returns the task re-read from the line it wrote", async () => {
    vault.setFileContent("tasks/test.md", "- [ ] Fit the loom 🆔 abc123");

    const updated = await makeTask().setFinance(FINANCE, app);

    expect(updated?.finance).toEqual(FINANCE);
    expect(updated?.summary).toBe("Fit the loom");
  });

  it("keeps the task's id", async () => {
    vault.setFileContent("tasks/test.md", "- [ ] Fit the loom");

    const task = makeTask("Fit the loom");
    const updated = await task.setFinance(FINANCE, app);

    expect(updated?.id).toBe("abc123");
  });

  it("replaces what was already there instead of piling up", async () => {
    vault.setFileContent(
      "tasks/test.md",
      "- [ ] Fit the loom [hours:: 8] [people:: Zoe 100%] 🆔 abc123"
    );

    const task = makeTask(
      "Fit the loom [hours:: 8] [people:: Zoe 100%] 🆔 abc123"
    );
    await task.setFinance(FINANCE, app);

    const line = vault.getFileContent("tasks/test.md");
    expect(line).not.toContain("Zoe");
    expect(line).not.toContain("[hours::");
    expect(line.match(/\[people::/g)).toHaveLength(1);
  });

  it("clears every field when given nothing", async () => {
    vault.setFileContent(
      "tasks/test.md",
      "- [ ] Fit the loom [hours:: 8] [people:: Zoe 100%] 📅 2026-03-06 🆔 abc123"
    );

    const task = makeTask(
      "Fit the loom [hours:: 8] [people:: Zoe 100%] 📅 2026-03-06 🆔 abc123"
    );
    await task.setFinance(EMPTY_TASK_FINANCE, app);

    expect(vault.getFileContent("tasks/test.md")).toBe(
      "- [ ] Fit the loom 📅 2026-03-06 🆔 abc123"
    );
  });

  it("leaves dates, tags and dependencies alone", async () => {
    vault.setFileContent(
      "tasks/test.md",
      "- [ ] Fit the loom #work 🛫 2026-03-02 📅 2026-03-06 ⛔ zzz999 🆔 abc123"
    );

    const task = makeTask(
      "Fit the loom #work 🛫 2026-03-02 📅 2026-03-06 ⛔ zzz999 🆔 abc123"
    );
    await task.setFinance({ ...EMPTY_TASK_FINANCE, totalHours: 4 }, app);

    const line = vault.getFileContent("tasks/test.md");
    expect(line).toContain("#work");
    expect(line).toContain("🛫 2026-03-02");
    expect(line).toContain("📅 2026-03-06");
    expect(line).toContain("⛔ zzz999");
    expect(line).toContain("[hours:: 4]");
  });

  it("leaves the other lines in the note untouched", async () => {
    vault.setFileContent(
      "tasks/test.md",
      "# Plan\n\n- [ ] Fit the loom 🆔 abc123\n- [ ] Something else 🆔 def456\n"
    );

    await makeTask().setFinance({ ...EMPTY_TASK_FINANCE, totalHours: 4 }, app);

    const content = vault.getFileContent("tasks/test.md");
    expect(content).toContain("- [ ] Something else 🆔 def456");
    expect(content.startsWith("# Plan")).toBe(true);
  });

  it("does nothing when the line cannot be found", async () => {
    vault.setFileContent("tasks/test.md", "- [ ] A different task 🆔 zzz999");

    const result = await makeTask().setFinance(FINANCE, app);

    expect(result).toBeNull();
    expect(vault.getFileContent("tasks/test.md")).toBe(
      "- [ ] A different task 🆔 zzz999"
    );
  });
});

describe("NoteTask.setFinance", () => {
  let vault: Vault;
  let app: App;

  beforeEach(() => {
    app = new App();
    vault = app.vault;
  });

  function makeTask(): NoteTask {
    return new NoteTask({
      id: "notes/loom.md",
      summary: "Loom",
      text: "Loom",
      tags: ["task"],
      status: "todo",
      priority: "",
      link: "notes/loom.md",
      incomingLinks: [],
      starred: false,
    });
  }

  const NOTE = `---
tags:
  - task
status: open
due: 2026-03-06
---

# Loom
`;

  it("writes the keys into frontmatter", async () => {
    vault.setFileContent("notes/loom.md", NOTE);

    await makeTask().setFinance(FINANCE, app);

    const content = vault.getFileContent("notes/loom.md");
    expect(content).toContain("hoursPerDay: 6");
    expect(content).toContain("person: Alice Smith");
    expect(content).toContain("share: 60");
    expect(content).toContain("description: Loom kit");
    expect(content).toContain("amount: 240");
  });

  it("leaves the rest of the frontmatter and the body alone", async () => {
    vault.setFileContent("notes/loom.md", NOTE);

    await makeTask().setFinance(FINANCE, app);

    const content = vault.getFileContent("notes/loom.md");
    expect(content).toContain("status: open");
    expect(content).toContain("2026-03-06");
    expect(content).toContain("# Loom");
  });

  it("returns the task carrying the new finance", async () => {
    vault.setFileContent("notes/loom.md", NOTE);

    const updated = await makeTask().setFinance(FINANCE, app);

    expect(updated?.finance).toEqual(FINANCE);
  });

  it("clears an old key written under a different spelling", async () => {
    vault.setFileContent(
      "notes/loom.md",
      `---
tags:
  - task
estimatedHours: 8
people: Zoe 100%
---

# Loom
`
    );

    await makeTask().setFinance({ ...EMPTY_TASK_FINANCE, totalHours: 16 }, app);

    const content = vault.getFileContent("notes/loom.md");
    expect(content).toContain("hours: 16");
    expect(content).not.toContain("estimatedHours");
    expect(content).not.toContain("Zoe");
  });

  it("clears every key when given nothing", async () => {
    vault.setFileContent(
      "notes/loom.md",
      `---
tags:
  - task
hours: 8
people:
  - person: Zoe
    share: 100
---

# Loom
`
    );

    await makeTask().setFinance(EMPTY_TASK_FINANCE, app);

    const content = vault.getFileContent("notes/loom.md");
    expect(content).not.toContain("hours");
    expect(content).not.toContain("Zoe");
    expect(content).toContain("- task");
  });

  it("does nothing to a note with no frontmatter", async () => {
    vault.setFileContent("notes/loom.md", "# Loom\n");

    const result = await makeTask().setFinance(FINANCE, app);

    expect(result).toBeNull();
    expect(vault.getFileContent("notes/loom.md")).toBe("# Loom\n");
  });

  it("does not lose finance when dates are written afterwards", async () => {
    vault.setFileContent("notes/loom.md", NOTE);

    const withFinance = await makeTask().setFinance(FINANCE, app);
    const withDates = await withFinance!.setDates({ start: "2026-03-02" }, app);

    expect(withDates?.finance).toEqual(FINANCE);
  });
});
