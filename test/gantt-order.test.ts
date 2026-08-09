import { NoteTask } from "../src/types/note-task";
import { GanttRow } from "../src/lib/gantt-rows";
import {
  applyOrder,
  groupRows,
  isGanttGroupBy,
  moveRelativeTo,
  moveWithinParent,
  normalizeOrder,
  orderByDate,
} from "../src/lib/gantt-order";

const LABELS = {
  untagged: "No tag",
  noProject: "No project",
  status: (status: string) => status,
};

function makeRow(
  id: string,
  overrides: {
    start?: string;
    end?: string;
    summary?: string;
    tags?: string[];
    status?: "todo" | "in_progress" | "done" | "canceled";
    link?: string;
    projects?: string[];
  } = {}
): GanttRow {
  const start = overrides.start ?? "2026-08-10";
  const end = overrides.end ?? start;

  return {
    task: new NoteTask({
      id,
      summary: overrides.summary ?? id,
      text: id,
      tags: overrides.tags ?? [],
      status: overrides.status ?? "todo",
      priority: "",
      link: overrides.link ?? "tasks/test.md",
      incomingLinks: [],
      starred: false,
      projects: overrides.projects ?? [],
      dates: [],
    }),
    bar: {
      id,
      start,
      end,
      startInferred: false,
      endInferred: false,
    },
    inferred: false,
  };
}

describe("normalizeOrder", () => {
  it("keeps the stored order for rows that are present", () => {
    const rows = [makeRow("a"), makeRow("b"), makeRow("c")];
    expect(normalizeOrder(rows, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("appends rows the order has not seen", () => {
    const rows = [makeRow("a"), makeRow("b"), makeRow("new")];
    expect(normalizeOrder(rows, ["b", "a"])).toEqual(["b", "a", "new"]);
  });

  it("drops ids whose rows are gone", () => {
    const rows = [makeRow("a")];
    expect(normalizeOrder(rows, ["deleted", "a"])).toEqual(["a"]);
  });

  it("removes duplicates", () => {
    const rows = [makeRow("a"), makeRow("b")];
    expect(normalizeOrder(rows, ["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("falls back to row order when nothing is stored", () => {
    const rows = [makeRow("x"), makeRow("y")];
    expect(normalizeOrder(rows, [])).toEqual(["x", "y"]);
  });
});

describe("applyOrder", () => {
  it("rearranges rows to match the order", () => {
    const rows = [makeRow("a"), makeRow("b"), makeRow("c")];
    const ordered = applyOrder(rows, ["c", "b", "a"]);
    expect(ordered.map((row) => row.task.id)).toEqual(["c", "b", "a"]);
  });

  it("leaves rows alone when the order is empty", () => {
    const rows = [makeRow("a"), makeRow("b")];
    expect(applyOrder(rows, []).map((row) => row.task.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow("a"), makeRow("b")];
    applyOrder(rows, ["b", "a"]);
    expect(rows.map((row) => row.task.id)).toEqual(["a", "b"]);
  });
});

describe("moveRelativeTo", () => {
  const order = ["a", "b", "c", "d"];

  it("moves a row before another", () => {
    expect(moveRelativeTo(order, "d", "b", "before")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("moves a row after another", () => {
    expect(moveRelativeTo(order, "a", "c", "after")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("moves a row to the very top", () => {
    expect(moveRelativeTo(order, "c", "a", "before")).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("moves a row to the very bottom", () => {
    expect(moveRelativeTo(order, "a", "d", "after")).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  describe("edge cases", () => {
    it("is a no-op when dropped on itself", () => {
      expect(moveRelativeTo(order, "b", "b", "before")).toEqual(order);
    });

    it("is a no-op for an unknown target", () => {
      expect(moveRelativeTo(order, "b", "missing", "after")).toEqual(order);
    });

    it("does not mutate the input", () => {
      const original = [...order];
      moveRelativeTo(order, "a", "d", "after");
      expect(order).toEqual(original);
    });
  });
});

describe("moveWithinParent", () => {
  /*
   * redesign
   *   logo
   *   copy
   * invoicing
   */
  const NESTED: ReadonlyMap<string, string | null> = new Map<
    string,
    string | null
  >([
    ["redesign", null],
    ["logo", "redesign"],
    ["copy", "redesign"],
    ["invoicing", null],
  ]);
  const nestedOrder = ["redesign", "logo", "copy", "invoicing"];

  const FLAT: ReadonlyMap<string, string | null> = new Map<
    string,
    string | null
  >([
    ["a", null],
    ["b", null],
    ["c", null],
    ["d", null],
  ]);

  it("reorders siblings inside their parent", () => {
    expect(
      moveWithinParent(nestedOrder, "copy", "logo", "before", NESTED)
    ).toEqual(["redesign", "copy", "logo", "invoicing"]);
  });

  it("refuses to move a child outside its parent's subtree", () => {
    expect(
      moveWithinParent(nestedOrder, "logo", "invoicing", "after", NESTED)
    ).toEqual(nestedOrder);
  });

  it("takes a parent's children along when the parent moves", () => {
    expect(
      moveWithinParent(nestedOrder, "redesign", "invoicing", "after", NESTED)
    ).toEqual(["invoicing", "redesign", "logo", "copy"]);
  });

  it("lands after a sibling's whole subtree, not inside it", () => {
    const order = ["redesign", "logo", "copy", "invoicing"];

    expect(
      moveWithinParent(order, "invoicing", "redesign", "after", NESTED)
    ).toEqual(["redesign", "logo", "copy", "invoicing"]);
  });

  it("treats a drop onto a nested row as a drop next to its ancestor", () => {
    expect(
      moveWithinParent(nestedOrder, "invoicing", "logo", "before", NESTED)
    ).toEqual(["invoicing", "redesign", "logo", "copy"]);
  });

  it("behaves like a flat move when nothing is nested", () => {
    const order = ["a", "b", "c", "d"];

    expect(moveWithinParent(order, "d", "b", "before", FLAT)).toEqual(
      moveRelativeTo(order, "d", "b", "before")
    );
    expect(moveWithinParent(order, "a", "c", "after", FLAT)).toEqual(
      moveRelativeTo(order, "a", "c", "after")
    );
  });

  describe("edge cases", () => {
    it("is a no-op when dropped on itself", () => {
      expect(
        moveWithinParent(nestedOrder, "logo", "logo", "before", NESTED)
      ).toEqual(nestedOrder);
    });

    it("refuses to drop a parent inside its own subtree", () => {
      expect(
        moveWithinParent(nestedOrder, "redesign", "logo", "after", NESTED)
      ).toEqual(nestedOrder);
    });

    it("is a no-op for a target nothing knows about", () => {
      expect(
        moveWithinParent(nestedOrder, "logo", "missing", "after", NESTED)
      ).toEqual(nestedOrder);
    });

    it("does not mutate the input", () => {
      const original = [...nestedOrder];
      moveWithinParent(nestedOrder, "copy", "logo", "before", NESTED);
      expect(nestedOrder).toEqual(original);
    });

    it("refuses rather than hangs on a map that still loops", () => {
      const looped: ReadonlyMap<string, string | null> = new Map<
        string,
        string | null
      >([
        ["a", "b"],
        ["b", "a"],
        ["c", null],
      ]);

      expect(
        moveWithinParent(["a", "b", "c"], "c", "a", "after", looped)
      ).toEqual(["a", "b", "c"]);
    });
  });
});

describe("orderByDate", () => {
  it("sorts earliest first", () => {
    const rows = [
      makeRow("late", { start: "2026-09-01" }),
      makeRow("early", { start: "2026-08-01" }),
      makeRow("middle", { start: "2026-08-15" }),
    ];
    expect(orderByDate(rows)).toEqual(["early", "middle", "late"]);
  });

  it("breaks ties on end date, then summary", () => {
    const rows = [
      makeRow("b", { start: "2026-08-01", end: "2026-08-05", summary: "Beta" }),
      makeRow("a", {
        start: "2026-08-01",
        end: "2026-08-02",
        summary: "Alpha",
      }),
      makeRow("c", { start: "2026-08-01", end: "2026-08-02", summary: "Aa" }),
    ];
    expect(orderByDate(rows)).toEqual(["c", "a", "b"]);
  });
});

describe("groupRows", () => {
  it("returns a single unlabelled group when grouping is off", () => {
    const rows = [makeRow("a"), makeRow("b")];
    const groups = groupRows(rows, "none", LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("");
    expect(groups[0].rows).toHaveLength(2);
  });

  it("groups by the task's first tag", () => {
    const rows = [
      makeRow("a", { tags: ["Mechanical"] }),
      makeRow("b", { tags: ["Electrical"] }),
      makeRow("c", { tags: ["Mechanical"] }),
    ];
    const groups = groupRows(rows, "tag", LABELS);
    expect(groups.map((group) => group.label)).toEqual([
      "#Electrical",
      "#Mechanical",
    ]);
    expect(groups[1].rows.map((row) => row.task.id)).toEqual(["a", "c"]);
  });

  it("files a multi-tag task under one group only", () => {
    const rows = [makeRow("a", { tags: ["Zeta", "Alpha"] })];
    const groups = groupRows(rows, "tag", LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("#Alpha");
  });

  it("puts untagged tasks in their own group, last", () => {
    const rows = [makeRow("a"), makeRow("b", { tags: ["Work"] })];
    const groups = groupRows(rows, "tag", LABELS);
    expect(groups[groups.length - 1].label).toBe("No tag");
  });

  it("orders status groups by workflow, not alphabetically", () => {
    const rows = [
      makeRow("done", { status: "done" }),
      makeRow("todo", { status: "todo" }),
      makeRow("wip", { status: "in_progress" }),
    ];
    const groups = groupRows(rows, "status", LABELS);
    expect(groups.map((group) => group.key)).toEqual([
      "in_progress",
      "todo",
      "done",
    ]);
  });

  it("groups by note, showing the file name without its extension", () => {
    const rows = [
      makeRow("a", { link: "Kohtari/Task List.md" }),
      makeRow("b", { link: "Kohtari/Task List.md" }),
    ];
    const groups = groupRows(rows, "file", LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Task List");
  });

  it("keeps the incoming row order inside a group", () => {
    const rows = [
      makeRow("second", { tags: ["Work"] }),
      makeRow("first", { tags: ["Work"] }),
    ];
    const groups = groupRows(rows, "tag", LABELS);
    expect(groups[0].rows.map((row) => row.task.id)).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("isGanttGroupBy", () => {
  it("accepts known values", () => {
    expect(isGanttGroupBy("tag")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isGanttGroupBy("colour")).toBe(false);
  });
});
