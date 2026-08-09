import { NoteTask } from "../src/types/note-task";
import { GanttRow } from "../src/lib/gantt-rows";
import {
  buildHierarchy,
  buildHierarchyTree,
  childrenByParent,
  collectDescendantIds,
  flattenHierarchy,
  parentTaskIds,
  resolveParentIds,
  toggleCollapsed,
} from "../src/lib/task-hierarchy";

/** A row with the dates and the parent a case needs, and nothing else. */
function makeTask(
  id: string,
  overrides: {
    start?: string;
    end?: string;
    parentId?: string | null;
    summary?: string;
    inferred?: boolean;
  } = {}
): GanttRow {
  const start = overrides.start ?? "2026-08-10";
  const end = overrides.end ?? start;

  return {
    task: new NoteTask({
      id,
      summary: overrides.summary ?? id,
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
      start,
      end,
      startInferred: false,
      endInferred: false,
    },
    inferred: overrides.inferred ?? false,
  };
}

/** The ids of the lines, in the order they would be drawn. */
function idsOf(lines: ReturnType<typeof flattenHierarchy>): string[] {
  return lines.map((line) => line.row.task.id);
}

/** The shape of the drawn lines, for the flattening assertions. */
function shapeOf(
  lines: ReturnType<typeof flattenHierarchy>
): Array<[string, number, boolean]> {
  return lines.map((line) => [line.row.task.id, line.depth, line.hasChildren]);
}

const NOTHING_COLLAPSED: ReadonlySet<string> = new Set();

describe("resolveParentIds", () => {
  it("keeps a parent that names a row in the set", () => {
    const rows = [
      makeTask("redesign"),
      makeTask("logo", { parentId: "redesign" }),
    ];

    expect(resolveParentIds(rows).get("logo")).toBe("redesign");
  });

  it("reads a row naming no parent as a root", () => {
    expect(resolveParentIds([makeTask("solo")]).get("solo")).toBeNull();
  });

  it.each<[string, string | null]>([
    ["a task naming itself", "self"],
    ["a task naming nothing at all", null],
    ["a task naming an id no row carries", "ghost"],
  ])("drops %s", (_case, parentId) => {
    const rows = [makeTask("self", { parentId })];

    expect(resolveParentIds(rows).get("self")).toBeNull();
  });
});

describe("buildHierarchyTree", () => {
  it("nests a child under its parent", () => {
    const rows = [
      makeTask("redesign"),
      makeTask("logo", { parentId: "redesign" }),
    ];

    const { roots } = buildHierarchyTree(rows);

    expect(roots).toHaveLength(1);
    expect(roots[0].row.task.id).toBe("redesign");
    expect(roots[0].children.map((child) => child.row.task.id)).toEqual([
      "logo",
    ]);
  });

  it("keeps row order between siblings", () => {
    const rows = [
      makeTask("redesign"),
      makeTask("second", { parentId: "redesign" }),
      makeTask("first", { parentId: "redesign" }),
    ];

    const { roots } = buildHierarchyTree(rows);

    expect(roots[0].children.map((child) => child.row.task.id)).toEqual([
      "second",
      "first",
    ]);
  });

  it("spans a parent's bar across its children", () => {
    const rows = [
      makeTask("redesign", { start: "2026-09-01", end: "2026-09-02" }),
      makeTask("logo", {
        parentId: "redesign",
        start: "2026-08-03",
        end: "2026-08-07",
      }),
      makeTask("copy", {
        parentId: "redesign",
        start: "2026-08-20",
        end: "2026-08-28",
      }),
    ];

    const { roots } = buildHierarchyTree(rows);

    expect(roots[0].row.bar.start).toBe("2026-08-03");
    expect(roots[0].row.bar.end).toBe("2026-08-28");
  });

  it("spans a grandparent across everything beneath it", () => {
    const rows = [
      makeTask("programme", { start: "2026-05-01", end: "2026-05-02" }),
      makeTask("redesign", {
        parentId: "programme",
        start: "2026-05-05",
        end: "2026-05-06",
      }),
      makeTask("logo", {
        parentId: "redesign",
        start: "2026-01-10",
        end: "2026-01-20",
      }),
      makeTask("copy", {
        parentId: "redesign",
        start: "2026-12-01",
        end: "2026-12-31",
      }),
    ];

    const { roots } = buildHierarchyTree(rows);

    expect(roots[0].row.task.id).toBe("programme");
    expect(roots[0].row.bar.start).toBe("2026-01-10");
    expect(roots[0].row.bar.end).toBe("2026-12-31");
  });

  it("takes the rollup as written rather than as suggested", () => {
    const rows = [
      makeTask("redesign", { inferred: true }),
      makeTask("logo", { parentId: "redesign", start: "2026-08-03" }),
    ];

    const { roots } = buildHierarchyTree(rows);

    expect(roots[0].row.inferred).toBe(false);
    expect(roots[0].row.bar.startInferred).toBe(false);
    expect(roots[0].row.bar.endInferred).toBe(false);
  });

  it("leaves a childless task's bar alone", () => {
    const rows = [makeTask("solo", { start: "2026-08-10", end: "2026-08-12" })];

    const { roots } = buildHierarchyTree(rows);

    expect(roots[0].row.bar.start).toBe("2026-08-10");
    expect(roots[0].row.bar.end).toBe("2026-08-12");
  });
});

describe("flattenHierarchy", () => {
  const rows = [
    makeTask("redesign"),
    makeTask("logo", { parentId: "redesign" }),
    makeTask("swatches", { parentId: "logo" }),
    makeTask("copy", { parentId: "redesign" }),
    makeTask("invoicing"),
  ];

  it("walks the tree top to bottom, deepest last within a branch", () => {
    const { roots } = buildHierarchyTree(rows);

    expect(shapeOf(flattenHierarchy(roots, NOTHING_COLLAPSED))).toEqual([
      ["redesign", 0, true],
      ["logo", 1, true],
      ["swatches", 2, false],
      ["copy", 1, false],
      ["invoicing", 0, false],
    ]);
  });

  it("hides a collapsed parent's whole subtree", () => {
    const { roots } = buildHierarchyTree(rows);
    const lines = flattenHierarchy(roots, new Set(["redesign"]));

    expect(idsOf(lines)).toEqual(["redesign", "invoicing"]);
    expect(lines[0].collapsed).toBe(true);
  });

  it("hides only what is under the collapsed row", () => {
    const { roots } = buildHierarchyTree(rows);

    expect(idsOf(flattenHierarchy(roots, new Set(["logo"])))).toEqual([
      "redesign",
      "logo",
      "copy",
      "invoicing",
    ]);
  });

  it("brings a subtree back when the row is expanded again", () => {
    const { roots } = buildHierarchyTree(rows);

    expect(idsOf(flattenHierarchy(roots, NOTHING_COLLAPSED))).toEqual(
      idsOf(flattenHierarchy(roots, new Set(["nobody"])))
    );
  });

  it("never marks a childless row as collapsed", () => {
    const { roots } = buildHierarchyTree(rows);
    const lines = flattenHierarchy(roots, new Set(["invoicing"]));

    expect(
      lines.find((line) => line.row.task.id === "invoicing")?.collapsed
    ).toBe(false);
    expect(idsOf(lines)).toHaveLength(5);
  });
});

describe("collectDescendantIds", () => {
  it("gathers children and grandchildren", () => {
    const rows = [
      makeTask("redesign"),
      makeTask("logo", { parentId: "redesign" }),
      makeTask("swatches", { parentId: "logo" }),
      makeTask("invoicing"),
    ];

    const { parentById } = buildHierarchyTree(rows);

    expect(collectDescendantIds(parentById, "redesign")).toEqual(
      new Set(["logo", "swatches"])
    );
  });

  it("gives a leaf nothing", () => {
    const rows = [makeTask("solo")];
    const { parentById } = buildHierarchyTree(rows);

    expect(collectDescendantIds(parentById, "solo").size).toBe(0);
  });
});

describe("childrenByParent and parentTaskIds", () => {
  const rows = [
    makeTask("redesign"),
    makeTask("logo", { parentId: "redesign" }),
    makeTask("copy", { parentId: "redesign" }),
    makeTask("invoicing"),
  ];

  it("indexes children under their parent, in row order", () => {
    expect(childrenByParent(resolveParentIds(rows)).get("redesign")).toEqual([
      "logo",
      "copy",
    ]);
  });

  it("names the tasks drawn as a summary of the rows beneath them", () => {
    expect(parentTaskIds(resolveParentIds(rows))).toEqual(
      new Set(["redesign"])
    );
  });

  it("names nothing when nothing is nested", () => {
    expect(parentTaskIds(resolveParentIds([makeTask("solo")])).size).toBe(0);
  });
});

describe("toggleCollapsed", () => {
  it("adds a task that was open", () => {
    expect(toggleCollapsed(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes a task that was folded", () => {
    expect(toggleCollapsed(["a", "b"], "a")).toEqual(["b"]);
  });

  it("leaves the stored list alone", () => {
    const stored = ["a"];
    toggleCollapsed(stored, "b");

    expect(stored).toEqual(["a"]);
  });
});

describe("edge cases", () => {
  it("makes a task that names itself a root", () => {
    const rows = [makeTask("ouroboros", { parentId: "ouroboros" })];

    const { lines } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(shapeOf(lines)).toEqual([["ouroboros", 0, false]]);
  });

  it("breaks a two-task cycle without losing either row", () => {
    const rows = [
      makeTask("a", { parentId: "b", start: "2026-08-01", end: "2026-08-05" }),
      makeTask("b", { parentId: "a", start: "2026-08-10", end: "2026-08-11" }),
    ];

    const { lines, parentById } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(shapeOf(lines)).toEqual([
      ["a", 0, true],
      ["b", 1, false],
    ]);
    expect(parentById.get("a")).toBeNull();
    expect(parentById.get("b")).toBe("a");
    // The surviving link still rolls up: A takes B's dates
    expect(lines[0].row.bar.start).toBe("2026-08-10");
    expect(lines[0].row.bar.end).toBe("2026-08-11");
  });

  it("breaks a longer cycle without losing a row", () => {
    const rows = [
      makeTask("a", { parentId: "b" }),
      makeTask("b", { parentId: "c" }),
      makeTask("c", { parentId: "d" }),
      makeTask("d", { parentId: "a" }),
    ];

    const { lines, parentById } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(idsOf(lines).sort()).toEqual(["a", "b", "c", "d"]);
    expect(parentById.get("a")).toBeNull();
    // Exactly one link is dropped: the rest of the chain is left intact
    expect(
      [...parentById.values()].filter((parentId) => parentId === null)
    ).toHaveLength(1);
  });

  it("keeps rows hanging off a cycle visible", () => {
    const rows = [
      makeTask("leaf", { parentId: "a" }),
      makeTask("a", { parentId: "b" }),
      makeTask("b", { parentId: "a" }),
    ];

    const { lines } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(idsOf(lines).sort()).toEqual(["a", "b", "leaf"]);
  });

  it("makes a task naming a missing parent a root", () => {
    const rows = [
      makeTask("orphan", { parentId: "deleted-last-week" }),
      makeTask("invoicing"),
    ];

    const { lines } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(shapeOf(lines)).toEqual([
      ["orphan", 0, false],
      ["invoicing", 0, false],
    ]);
  });

  it("makes a task a root when its parent is filtered out of view", () => {
    const all = [
      makeTask("redesign"),
      makeTask("logo", { parentId: "redesign" }),
    ];
    // The same child, with the parent no longer among the rows on screen
    const filtered = all.slice(1);

    expect(shapeOf(buildHierarchy(filtered, NOTHING_COLLAPSED).lines)).toEqual([
      ["logo", 0, false],
    ]);
  });

  it("keeps a parent's own bar when no child offers dates", () => {
    const rows = [
      makeTask("redesign", { start: "2026-08-01", end: "2026-08-09" }),
      {
        ...makeTask("logo", { parentId: "redesign" }),
        bar: {
          id: "logo",
          start: "",
          end: "",
          startInferred: true,
          endInferred: true,
        },
      },
    ];

    const { lines } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(lines[0].row.bar.start).toBe("2026-08-01");
    expect(lines[0].row.bar.end).toBe("2026-08-09");
    expect(lines[0].hasChildren).toBe(true);
  });

  it("handles no rows at all", () => {
    const { lines, parentById } = buildHierarchy([], NOTHING_COLLAPSED);

    expect(lines).toEqual([]);
    expect(parentById.size).toBe(0);
  });

  it("does not hang on a long chain", () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      makeTask(`t${index}`, {
        parentId: index === 0 ? null : `t${index - 1}`,
        start: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
      })
    );

    const { lines } = buildHierarchy(rows, NOTHING_COLLAPSED);

    expect(lines).toHaveLength(500);
    expect(lines[499].depth).toBe(499);
  });
});
