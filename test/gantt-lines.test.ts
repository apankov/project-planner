import { NoteTask } from "../src/types/note-task";
import { GanttRow } from "../src/lib/gantt-rows";
import { GanttMilestone, milestoneOrderKey } from "../src/lib/gantt-milestones";
import { HierarchyGroup, buildHierarchy } from "../src/lib/task-hierarchy";
import { buildLines, visibleRowsOf } from "../src/lib/gantt-lines";

function makeRow(
  id: string,
  overrides: { parentId?: string | null } = {}
): GanttRow {
  return {
    task: new NoteTask({
      id,
      summary: id,
      text: id,
      tags: [],
      status: "todo",
      priority: "",
      link: "tasks/test.md",
      incomingLinks: [],
      starred: false,
      parentId: overrides.parentId ?? null,
    }),
    bar: {
      id,
      start: "2026-08-10",
      end: "2026-08-10",
      startInferred: false,
      endInferred: false,
    },
    inferred: false,
  };
}

function makeMilestone(
  id: string,
  overrides: Partial<GanttMilestone> = {}
): GanttMilestone {
  return {
    id,
    label: `Milestone ${id}`,
    date: "2026-08-10",
    display: "row",
    ...overrides,
  };
}

/** One unlabelled group holding these rows, the way "group by nothing" does. */
function oneGroup(
  rows: GanttRow[],
  collapsed: string[] = []
): HierarchyGroup[] {
  const { lines } = buildHierarchy(rows, new Set(collapsed));
  return [{ key: "all", label: "", count: rows.length, lines }];
}

/** A labelled group, the way grouping by tag or status does. */
function namedGroup(key: string, rows: GanttRow[]): HierarchyGroup {
  const { lines } = buildHierarchy(rows, new Set());
  return { key, label: key, count: rows.length, lines };
}

/** What each line is, in the order it would be drawn. */
function shapeOf(lines: ReturnType<typeof buildLines>): string[] {
  return lines.map((line) => {
    if (line.kind === "header") return `header:${line.label}`;
    if (line.kind === "milestone") return `milestone:${line.milestone.id}`;
    return `row:${line.row.task.id}`;
  });
}

describe("buildLines", () => {
  describe("without milestones", () => {
    it("draws the rows in the order given", () => {
      const rows = [makeRow("a"), makeRow("b")];
      expect(shapeOf(buildLines(oneGroup(rows), [], ["a", "b"]))).toEqual([
        "row:a",
        "row:b",
      ]);
    });

    it("puts a labelled group's heading above its rows", () => {
      const lines = buildLines(
        [
          namedGroup("done", [makeRow("a")]),
          namedGroup("todo", [makeRow("b")]),
        ],
        [],
        ["a", "b"]
      );

      expect(shapeOf(lines)).toEqual([
        "header:done",
        "row:a",
        "header:todo",
        "row:b",
      ]);
    });

    it("leaves out rows folded away inside a collapsed parent", () => {
      const rows = [
        makeRow("parent"),
        makeRow("child", { parentId: "parent" }),
      ];
      const lines = buildLines(
        oneGroup(rows, ["parent"]),
        [],
        ["parent", "child"]
      );

      expect(shapeOf(lines)).toEqual(["row:parent"]);
    });

    it("ignores milestones drawn in the lane", () => {
      const rows = [makeRow("a")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m", { display: "lane" })],
        ["a", milestoneOrderKey("m")]
      );

      expect(shapeOf(lines)).toEqual(["row:a"]);
    });
  });

  describe("with row milestones", () => {
    it("slots a milestone where the order puts it", () => {
      const rows = [makeRow("a"), makeRow("b")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m")],
        ["a", milestoneOrderKey("m"), "b"]
      );

      expect(shapeOf(lines)).toEqual(["row:a", "milestone:m", "row:b"]);
    });

    it("draws one that leads the order above every task", () => {
      const rows = [makeRow("a"), makeRow("b")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m")],
        [milestoneOrderKey("m"), "a", "b"]
      );

      expect(shapeOf(lines)).toEqual(["milestone:m", "row:a", "row:b"]);
    });

    it("draws one that ends the order below every task", () => {
      const rows = [makeRow("a"), makeRow("b")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m")],
        ["a", "b", milestoneOrderKey("m")]
      );

      expect(shapeOf(lines)).toEqual(["row:a", "row:b", "milestone:m"]);
    });

    // A milestone that has just been switched from the lane to a row has no
    // slot yet; it belongs at the end rather than silently at the top
    it("puts a milestone the order has never seen last", () => {
      const rows = [makeRow("a"), makeRow("b")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m")],
        ["a", "b"]
      );

      expect(shapeOf(lines)).toEqual(["row:a", "row:b", "milestone:m"]);
    });

    it("keeps several milestones in their order", () => {
      const rows = [makeRow("a")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m1"), makeMilestone("m2")],
        [milestoneOrderKey("m2"), "a", milestoneOrderKey("m1")]
      );

      expect(shapeOf(lines)).toEqual(["milestone:m2", "row:a", "milestone:m1"]);
    });

    it("draws two adjacent milestones one after the other", () => {
      const rows = [makeRow("a")];
      const lines = buildLines(
        oneGroup(rows),
        [makeMilestone("m1"), makeMilestone("m2")],
        [milestoneOrderKey("m1"), milestoneOrderKey("m2"), "a"]
      );

      expect(shapeOf(lines)).toEqual(["milestone:m1", "milestone:m2", "row:a"]);
    });

    // A milestone has no tag, no status, no note and no project, so there is
    // no heading it could honestly be filed under
    it("draws a milestone between groups rather than inside one", () => {
      const lines = buildLines(
        [
          namedGroup("done", [makeRow("a")]),
          namedGroup("todo", [makeRow("b")]),
        ],
        [makeMilestone("m")],
        ["a", milestoneOrderKey("m"), "b"]
      );

      expect(shapeOf(lines)).toEqual([
        "header:done",
        "row:a",
        "milestone:m",
        "header:todo",
        "row:b",
      ]);
    });

    it("draws a milestone above the first heading when it leads the order", () => {
      const lines = buildLines(
        [namedGroup("done", [makeRow("a")])],
        [makeMilestone("m")],
        [milestoneOrderKey("m"), "a"]
      );

      expect(shapeOf(lines)).toEqual(["milestone:m", "header:done", "row:a"]);
    });

    it("keeps a milestone visible when the task beside it is folded away", () => {
      const rows = [
        makeRow("parent"),
        makeRow("child", { parentId: "parent" }),
      ];
      const lines = buildLines(
        oneGroup(rows, ["parent"]),
        [makeMilestone("m")],
        ["parent", "child", milestoneOrderKey("m")]
      );

      expect(shapeOf(lines)).toEqual(["row:parent", "milestone:m"]);
    });

    it("gives a milestone its own slot id, never a task's", () => {
      const lines = buildLines(
        oneGroup([makeRow("a")]),
        [makeMilestone("m")],
        ["a", milestoneOrderKey("m")]
      );

      const milestone = lines.find((line) => line.kind === "milestone");
      expect(milestone?.orderId).toBe(milestoneOrderKey("m"));
    });

    it("gives a heading no slot at all, so it is never a drop target", () => {
      const lines = buildLines([namedGroup("done", [makeRow("a")])], [], ["a"]);
      expect(lines[0].orderId).toBeNull();
    });
  });

  describe("visibleRowsOf", () => {
    it("returns only the task rows", () => {
      const rows = [makeRow("a"), makeRow("b")];
      const lines = buildLines(
        [namedGroup("done", rows)],
        [makeMilestone("m")],
        ["a", milestoneOrderKey("m"), "b"]
      );

      expect(visibleRowsOf(lines).map((row) => row.task.id)).toEqual([
        "a",
        "b",
      ]);
    });

    it("returns nothing when there is nothing to draw", () => {
      expect(visibleRowsOf(buildLines([], [], []))).toEqual([]);
    });
  });
});
