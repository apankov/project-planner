import { NoteTask } from "../src/types/note-task";
import { TaskDateProperty } from "../src/lib/task-dates";
import {
  buildGanttRows,
  getDependencies,
  getInferredRows,
  toScheduleInput,
} from "../src/lib/gantt-rows";

const TODAY = "2026-08-06";

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

function dates(entries: Record<string, string>): TaskDateProperty[] {
  return Object.entries(entries).map(([type, date]) => ({
    type: type as TaskDateProperty["type"],
    date,
  }));
}

describe("toScheduleInput", () => {
  it("reads start and due from the task", () => {
    const task = makeTask({
      dates: dates({ start: "2026-08-10", due: "2026-08-12" }),
    });

    expect(toScheduleInput(task)).toMatchObject({
      start: "2026-08-10",
      due: "2026-08-12",
    });
  });

  it("falls back to the scheduled date when there is no start", () => {
    const task = makeTask({ dates: dates({ scheduled: "2026-08-11" }) });

    expect(toScheduleInput(task).start).toBe("2026-08-11");
  });

  it("prefers an explicit start over a scheduled date", () => {
    const task = makeTask({
      dates: dates({ start: "2026-08-09", scheduled: "2026-08-11" }),
    });

    expect(toScheduleInput(task).start).toBe("2026-08-09");
  });

  it("reports no dates for a bare task", () => {
    expect(toScheduleInput(makeTask())).toMatchObject({
      start: null,
      due: null,
      done: null,
    });
  });
});

describe("buildGanttRows", () => {
  it("gives every task a row, dated or not", () => {
    const rows = buildGanttRows(
      [
        makeTask({ id: "a", dates: dates({ start: "2026-08-10" }) }),
        makeTask({ id: "b" }),
      ],
      { today: TODAY }
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.task.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps the tasks in the order they were given", () => {
    // Row order belongs to the user (see gantt-order), so scheduling must not
    // quietly re-sort by date
    const rows = buildGanttRows(
      [
        makeTask({ id: "late", dates: dates({ start: "2026-09-01" }) }),
        makeTask({ id: "early", dates: dates({ start: "2026-08-01" }) }),
        makeTask({ id: "middle", dates: dates({ start: "2026-08-15" }) }),
      ],
      { today: TODAY }
    );

    expect(rows.map((row) => row.task.id)).toEqual(["late", "early", "middle"]);
  });

  it("marks a task with no dates as inferred", () => {
    const rows = buildGanttRows([makeTask({ id: "a" })], { today: TODAY });

    expect(rows[0].inferred).toBe(true);
    expect(rows[0].bar).toMatchObject({ start: TODAY, end: TODAY });
  });

  it("does not mark a fully dated task as inferred", () => {
    const rows = buildGanttRows(
      [
        makeTask({
          id: "a",
          dates: dates({ start: "2026-08-10", due: "2026-08-12" }),
        }),
      ],
      { today: TODAY }
    );

    expect(rows[0].inferred).toBe(false);
  });

  it("flows an undated task after its blocker", () => {
    const rows = buildGanttRows(
      [
        makeTask({
          id: "blocker",
          dates: dates({ start: "2026-08-10", due: "2026-08-11" }),
        }),
        makeTask({ id: "blocked", incomingLinks: ["blocker"] }),
      ],
      { today: TODAY }
    );

    const blocked = rows.find((row) => row.task.id === "blocked");
    expect(blocked?.bar.start).toBe("2026-08-12");
  });

  it("drops tasks the scheduler could not place", () => {
    const rows = buildGanttRows([], { today: TODAY });

    expect(rows).toEqual([]);
  });
});

describe("getDependencies", () => {
  it("links a blocker row to the row it blocks", () => {
    const rows = buildGanttRows(
      [
        makeTask({ id: "a", dates: dates({ start: "2026-08-01" }) }),
        makeTask({
          id: "b",
          incomingLinks: ["a"],
          dates: dates({ start: "2026-08-05" }),
        }),
      ],
      { today: TODAY }
    );

    expect(getDependencies(rows)).toEqual([
      { fromId: "a", toId: "b", fromRow: 0, toRow: 1 },
    ]);
  });

  it("drops links to tasks that are filtered out", () => {
    const rows = buildGanttRows(
      [makeTask({ id: "b", incomingLinks: ["missing"] })],
      { today: TODAY }
    );

    expect(getDependencies(rows)).toEqual([]);
  });

  it("ignores a self-link", () => {
    const rows = buildGanttRows([makeTask({ id: "a", incomingLinks: ["a"] })], {
      today: TODAY,
    });

    expect(getDependencies(rows)).toEqual([]);
  });
});

describe("getInferredRows", () => {
  it("returns only the rows whose dates are proposals", () => {
    const rows = buildGanttRows(
      [
        makeTask({
          id: "dated",
          dates: dates({ start: "2026-08-10", due: "2026-08-11" }),
        }),
        makeTask({ id: "undated" }),
      ],
      { today: TODAY }
    );

    expect(getInferredRows(rows).map((row) => row.task.id)).toEqual([
      "undated",
    ]);
  });
});
