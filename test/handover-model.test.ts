import { NoteTask } from "../src/types/note-task";
import { TaskDateProperty } from "../src/lib/task-dates";
import { GanttRow } from "../src/lib/gantt-rows";
import { CriticalPath, EMPTY_CRITICAL_PATH } from "../src/lib/critical-path";
import { EMPTY_COST_REPORT } from "../src/lib/finance-summary";
import { TaskCost } from "../src/lib/task-cost";
import {
  HandoverNote,
  buildFinance,
  buildSummary,
  buildTaskRows,
  noteAnchor,
  sortNotes,
  taskAnchor,
} from "../src/lib/handover/handover-model";

const TODAY = "2026-08-17";

function makeTask(
  overrides: Partial<ConstructorParameters<typeof NoteTask>[0]> = {}
): NoteTask {
  return new NoteTask({
    id: "abc123",
    summary: "Test task",
    text: "Test task",
    tags: [],
    status: "todo",
    priority: "",
    link: "tasks/test.md",
    incomingLinks: [],
    starred: false,
    projects: [],
    dates: [],
    ...overrides,
  });
}

function makeRow(
  overrides: Partial<ConstructorParameters<typeof NoteTask>[0]> = {},
  bar: { start: string; end: string } = {
    start: "2026-08-10",
    end: "2026-08-14",
  },
  inferred = false
): GanttRow {
  const task = makeTask(overrides);
  return {
    task,
    bar: {
      id: task.id,
      start: bar.start,
      end: bar.end,
      startInferred: inferred,
      endInferred: inferred,
    },
    inferred,
  };
}

function depths(rows: GanttRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.task.id, 0]));
}

function build(rows: GanttRow[], critical: CriticalPath = EMPTY_CRITICAL_PATH) {
  return buildTaskRows({
    rows,
    depthById: depths(rows),
    critical,
    costs: null,
    today: TODAY,
  });
}

describe("buildTaskRows", () => {
  it("keeps the order the rows were given", () => {
    const rows = build([
      makeRow({ id: "c" }),
      makeRow({ id: "a" }),
      makeRow({ id: "b" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("carries the bar's dates rather than the task's", () => {
    const [row] = build([
      makeRow({ id: "a" }, { start: "2026-09-01", end: "2026-09-09" }),
    ]);

    expect(row.start).toBe("2026-09-01");
    expect(row.end).toBe("2026-09-09");
  });

  describe("task names", () => {
    it("shows the words of a wikilinked task, not its brackets", () => {
      const [row] = build([
        makeRow({ id: "a", summary: "[[Redesign Float Section]]" }),
      ]);

      expect(row.summary).toBe("Redesign Float Section");
    });

    it("prefers a wikilink's alias", () => {
      const [row] = build([
        makeRow({ id: "a", summary: "[[Notes/Spec Batteries|Spec cells]]" }),
      ]);

      expect(row.summary).toBe("Spec cells");
    });

    it("drops the folders from a linked note's path", () => {
      const [row] = build([
        makeRow({ id: "a", summary: "[[Notes/Spec Batteries]]" }),
      ]);

      expect(row.summary).toBe("Spec Batteries");
    });

    it("leaves an ordinary task name alone", () => {
      const [row] = build([makeRow({ id: "a", summary: "Purchase Motor" })]);

      expect(row.summary).toBe("Purchase Motor");
    });
  });

  it("works out who is waiting on whom", () => {
    const rows = build([
      makeRow({ id: "a" }),
      makeRow({ id: "b", incomingLinks: ["a"] }),
      makeRow({ id: "c", incomingLinks: ["a"] }),
    ]);

    expect(rows[0].blocks.sort()).toEqual(["b", "c"]);
    expect(rows[1].dependsOn).toEqual(["a"]);
    expect(rows[0].dependsOn).toEqual([]);
  });

  it("drops a dependency on a task that is not in the pack", () => {
    const [row] = build([makeRow({ id: "a", incomingLinks: ["filtered"] })]);

    expect(row.dependsOn).toEqual([]);
  });

  it("marks the critical path and its float", () => {
    const critical: CriticalPath = {
      criticalIds: new Set(["a"]),
      floatByTaskId: new Map([
        ["a", 0],
        ["b", 4],
      ]),
      criticalEdgeKeys: new Set(),
      projectFinish: "2026-08-14",
    };

    const rows = build([makeRow({ id: "a" }), makeRow({ id: "b" })], critical);

    expect(rows[0]).toMatchObject({ critical: true, floatDays: 0 });
    expect(rows[1]).toMatchObject({ critical: false, floatDays: 4 });
  });

  describe("overdue", () => {
    it("flags unfinished work that has run past its end date", () => {
      const [row] = build([
        makeRow(
          { id: "a", status: "in_progress" },
          {
            start: "2026-08-01",
            end: "2026-08-05",
          }
        ),
      ]);

      expect(row.overdue).toBe(true);
    });

    it("does not flag finished work", () => {
      const [row] = build([
        makeRow(
          { id: "a", status: "done" },
          {
            start: "2026-08-01",
            end: "2026-08-05",
          }
        ),
      ]);

      expect(row.overdue).toBe(false);
    });

    it("does not flag cancelled work", () => {
      const [row] = build([
        makeRow(
          { id: "a", status: "canceled" },
          {
            start: "2026-08-01",
            end: "2026-08-05",
          }
        ),
      ]);

      expect(row.overdue).toBe(false);
    });

    it("does not flag work that ends today", () => {
      const [row] = build([makeRow({ id: "a" }, { start: TODAY, end: TODAY })]);

      expect(row.overdue).toBe(false);
    });
  });

  describe("costs", () => {
    it("leaves hours and cost unset when finance is off", () => {
      const [row] = build([makeRow({ id: "a" })]);

      expect(row.hours).toBeNull();
      expect(row.cost).toBeNull();
    });

    it("carries the cost when there is one", () => {
      const rows = [makeRow({ id: "a" })];
      const cost: TaskCost = {
        taskId: "a",
        total: 1200,
        labour: 1000,
        materials: 200,
        hours: 10,
        unpricedHours: 0,
        unallocatedHours: 0,
        lines: [],
        issues: [],
        inferred: false,
        hoursSource: "explicit",
      };

      const [row] = buildTaskRows({
        rows,
        depthById: depths(rows),
        critical: EMPTY_CRITICAL_PATH,
        costs: new Map([["a", cost]]),
        today: TODAY,
      });

      expect(row.cost).toBe(1200);
      expect(row.hours).toBe(10);
    });
  });

  describe("edge cases", () => {
    it("ignores a task that depends on itself", () => {
      const [row] = build([makeRow({ id: "a", incomingLinks: ["a"] })]);

      expect(row.dependsOn).toEqual([]);
      expect(row.blocks).toEqual([]);
    });

    it("handles no rows at all", () => {
      expect(build([])).toEqual([]);
    });
  });
});

describe("buildSummary", () => {
  const noQuestions = { milestones: [], questions: [], noteCount: 0 };

  it("counts the statuses in a fixed order", () => {
    const summary = buildSummary({
      ...noQuestions,
      tasks: build([
        makeRow({ id: "a", status: "done" }),
        makeRow({ id: "b", status: "todo" }),
        makeRow({ id: "c", status: "todo" }),
      ]),
    });

    expect(summary.statusCounts).toEqual([
      { status: "todo", count: 2 },
      { status: "done", count: 1 },
    ]);
    expect(summary.taskCount).toBe(3);
  });

  it("finds the span the plan covers", () => {
    const summary = buildSummary({
      ...noQuestions,
      tasks: build([
        makeRow({ id: "a" }, { start: "2026-09-01", end: "2026-09-04" }),
        makeRow({ id: "b" }, { start: "2026-08-02", end: "2026-08-30" }),
      ]),
    });

    expect(summary.start).toBe("2026-08-02");
    expect(summary.finish).toBe("2026-09-04");
  });

  it("counts tasks nobody is answerable for", () => {
    const summary = buildSummary({
      ...noQuestions,
      tasks: build([makeRow({ id: "a", owner: "Ada" }), makeRow({ id: "b" })]),
    });

    expect(summary.unownedCount).toBe(1);
  });

  it("splits questions into open and answered", () => {
    const summary = buildSummary({
      milestones: [],
      noteCount: 3,
      tasks: [],
      questions: [
        {
          id: "n.md:1",
          question: "Open one",
          resolved: false,
          resolvedOn: null,
          notePath: "n.md",
          noteName: "n",
          line: 1,
          rawLine: "",
          answer: null,
          answerEndLine: null,
        },
        {
          id: "n.md:5",
          question: "Settled one",
          resolved: true,
          resolvedOn: "2026-01-01",
          notePath: "n.md",
          noteName: "n",
          line: 5,
          rawLine: "",
          answer: "Yes",
          answerEndLine: 6,
        },
      ],
    });

    expect(summary.openQuestionCount).toBe(1);
    expect(summary.answeredQuestionCount).toBe(1);
    expect(summary.noteCount).toBe(3);
  });

  it("reports an empty plan without inventing a span", () => {
    const summary = buildSummary({ ...noQuestions, tasks: [] });

    expect(summary.start).toBeNull();
    expect(summary.finish).toBeNull();
    expect(summary.statusCounts).toEqual([]);
  });
});

describe("buildFinance", () => {
  it("names the biggest costs first and stops at the limit", () => {
    const rows = build([
      makeRow({ id: "a" }),
      makeRow({ id: "b" }),
      makeRow({ id: "c" }),
    ]);
    rows[0].cost = 100;
    rows[1].cost = 900;
    rows[2].cost = 500;

    const finance = buildFinance({
      report: EMPTY_COST_REPORT,
      byPerson: [],
      byProject: [],
      tasks: rows,
      currency: "GBP",
      includeInferred: true,
      driverLimit: 2,
      describeIssue: () => "",
    });

    expect(finance.drivers.map((driver) => driver.id)).toEqual(["b", "c"]);
  });

  it("leaves out tasks that cost nothing", () => {
    const rows = build([makeRow({ id: "a" }), makeRow({ id: "b" })]);
    rows[0].cost = 0;
    rows[1].cost = 40;

    const finance = buildFinance({
      report: EMPTY_COST_REPORT,
      byPerson: [],
      byProject: [],
      tasks: rows,
      currency: "GBP",
      includeInferred: true,
      driverLimit: 10,
      describeIssue: () => "",
    });

    expect(finance.drivers.map((driver) => driver.id)).toEqual(["b"]);
  });

  it("puts each costing problem into words", () => {
    const finance = buildFinance({
      report: {
        ...EMPTY_COST_REPORT,
        issues: [
          {
            taskId: "a",
            summary: "Test task",
            issue: { kind: "unknown-person", person: "Ada" },
          },
        ],
      },
      byPerson: [],
      byProject: [],
      tasks: build([makeRow({ id: "a" })]),
      currency: "GBP",
      includeInferred: true,
      driverLimit: 10,
      describeIssue: (issue) =>
        issue.kind === "unknown-person" ? `no rate for ${issue.person}` : "?",
    });

    expect(finance.issues[0].issue).toBe("no rate for Ada");
  });
});

describe("anchors", () => {
  it("gives every note a distinct anchor", () => {
    expect(noteAnchor("Projects/Q3 plan.md")).not.toBe(
      noteAnchor("Archive/Q3 plan.md")
    );
  });

  it("returns the same anchor for the same path", () => {
    expect(noteAnchor("a/b.md")).toBe(noteAnchor("a/b.md"));
  });

  it("produces something safe to put in an href", () => {
    const anchor = noteAnchor("Some Folder/Weird ✱ name!.md");

    expect(anchor).toMatch(/^note-[a-z0-9-]*-[a-z0-9]+$/);
  });

  it("names an untitled path rather than producing a bare hash", () => {
    expect(noteAnchor("✱.md")).toContain("untitled");
  });

  it("makes a task anchor from its ID", () => {
    expect(taskAnchor("ABC-123")).toBe("task-abc-123");
  });
});

describe("sortNotes", () => {
  function note(path: string, folder: string, title: string): HandoverNote {
    return { path, folder, title, html: "", anchor: noteAnchor(path) };
  }

  it("groups by folder, then sorts by name", () => {
    const sorted = sortNotes([
      note("b/z.md", "b", "z"),
      note("a/m.md", "a", "m"),
      note("b/a.md", "b", "a"),
      note("a/c.md", "a", "c"),
    ]);

    expect(sorted.map((entry) => entry.path)).toEqual([
      "a/c.md",
      "a/m.md",
      "b/a.md",
      "b/z.md",
    ]);
  });

  it("puts root notes before foldered ones", () => {
    const sorted = sortNotes([note("z/a.md", "z", "a"), note("b.md", "", "b")]);

    expect(sorted[0].path).toBe("b.md");
  });

  it("does not modify the array it was given", () => {
    const notes = [note("b.md", "", "b"), note("a.md", "", "a")];
    sortNotes(notes);

    expect(notes[0].path).toBe("b.md");
  });
});
