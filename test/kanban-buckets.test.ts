import { NoteTask } from "../src/types/note-task";
import { BaseTask } from "../src/types/base-task";
import { TaskStatus } from "../src/types/task";
import { EMPTY_TASK_FINANCE } from "../src/lib/task-finance";
import {
  applyCardOrder,
  assignSolePerson,
  bucketKeyFor,
  buildBuckets,
  dueBucketKey,
  dueDateForBucket,
  endOfWeek,
  isKanbanGroupBy,
  isWritableGroupBy,
  orderTasksByDue,
  retagForBucket,
  taskPerson,
  taskTag,
} from "../src/lib/kanban-buckets";

// A Monday, so the week-relative buckets all have room in them
const TODAY = "2026-08-10";

const LABELS = {
  status: (status: string) => `status:${status}`,
  due: (key: string) => `due:${key}`,
  priority: (value: string) => `priority:${value}`,
  noTag: "No tag",
  noPerson: "Unassigned",
  noProject: "No project",
  noPriority: "No priority",
};

function makeTask(
  id: string,
  overrides: {
    summary?: string;
    tags?: string[];
    status?: TaskStatus;
    priority?: string;
    link?: string;
    projects?: string[];
    due?: string;
    people?: string[];
  } = {}
): BaseTask {
  return new NoteTask({
    id,
    summary: overrides.summary ?? id,
    text: id,
    tags: overrides.tags ?? [],
    status: overrides.status ?? "todo",
    priority: overrides.priority ?? "",
    link: overrides.link ?? "tasks/test.md",
    incomingLinks: [],
    starred: false,
    projects: overrides.projects ?? [],
    dates: overrides.due ? [{ type: "due", date: overrides.due }] : [],
    finance: {
      ...EMPTY_TASK_FINANCE,
      allocations: (overrides.people ?? []).map((person) => ({
        person,
        share: 1,
      })),
    },
  });
}

function build(tasks: BaseTask[], groupBy: string, order?: string[]) {
  return buildBuckets(tasks, groupBy as Parameters<typeof buildBuckets>[1], {
    today: TODAY,
    labels: LABELS,
    order,
  });
}

describe("isKanbanGroupBy", () => {
  it.each(["status", "due", "person", "tag", "project", "priority", "file"])(
    "accepts %s",
    (value) => {
      expect(isKanbanGroupBy(value)).toBe(true);
    }
  );

  it("rejects anything else", () => {
    expect(isKanbanGroupBy("colour")).toBe(false);
  });
});

describe("isWritableGroupBy", () => {
  it.each(["status", "due", "person", "tag"] as const)(
    "%s can be written by a drop",
    (groupBy) => {
      expect(isWritableGroupBy(groupBy)).toBe(true);
    }
  );

  it.each(["project", "priority", "file"] as const)(
    "%s cannot be written by a drop",
    (groupBy) => {
      expect(isWritableGroupBy(groupBy)).toBe(false);
    }
  );
});

describe("dueBucketKey", () => {
  it.each([
    ["2026-08-09", "overdue"],
    ["2026-08-01", "overdue"],
    ["2026-08-10", "today"],
    ["2026-08-11", "tomorrow"],
    ["2026-08-12", "this_week"],
    ["2026-08-16", "this_week"],
    ["2026-08-17", "next_week"],
    ["2026-08-23", "next_week"],
    ["2026-08-24", "later"],
  ])("puts %s in %s", (due, expected) => {
    expect(dueBucketKey(due, TODAY)).toBe(expected);
  });

  it("puts a task with no due date in the no-date bucket", () => {
    expect(dueBucketKey(null, TODAY)).toBe("none");
  });

  it("treats an unreadable date as no date at all", () => {
    expect(dueBucketKey("next tuesday", TODAY)).toBe("none");
    expect(dueBucketKey("2026-02-31", TODAY)).toBe("none");
  });
});

describe("endOfWeek", () => {
  it("ends the week on Sunday", () => {
    expect(endOfWeek("2026-08-10")).toBe("2026-08-16");
    expect(endOfWeek("2026-08-16")).toBe("2026-08-16");
  });
});

describe("dueDateForBucket", () => {
  it.each([
    ["today", "2026-08-10"],
    ["tomorrow", "2026-08-11"],
    ["this_week", "2026-08-16"],
    ["next_week", "2026-08-23"],
    ["later", "2026-08-24"],
  ])("writes %s as %s", (key, expected) => {
    expect(
      dueDateForBucket(key as Parameters<typeof dueDateForBucket>[0], TODAY)
    ).toBe(expected);
  });

  it("clears the date for the no-date bucket", () => {
    expect(dueDateForBucket("none", TODAY)).toBeNull();
  });

  it("has no day for overdue, so nothing can be dropped there", () => {
    expect(dueDateForBucket("overdue", TODAY)).toBeUndefined();
  });

  it("round-trips: what a bucket writes lands back in that bucket", () => {
    for (const key of [
      "today",
      "tomorrow",
      "this_week",
      "next_week",
      "later",
    ]) {
      const due = dueDateForBucket(
        key as Parameters<typeof dueDateForBucket>[0],
        TODAY
      );
      expect(dueBucketKey(due as string, TODAY)).toBe(key);
    }
  });
});

describe("bucketKeyFor", () => {
  it("files by the status written in the file, not the one progress implies", () => {
    const task = makeTask("a", { status: "todo" });
    task.progress = { percent: 40 };
    expect(bucketKeyFor(task, "status", TODAY)).toBe("todo");
  });

  it("files a multi-tagged task under its first tag alphabetically", () => {
    expect(taskTag(makeTask("a", { tags: ["zeta", "alpha"] }))).toBe("alpha");
  });

  it("files a shared task under its first person", () => {
    expect(taskPerson(makeTask("a", { people: ["Bob", "Alice"] }))).toBe("Bob");
  });

  it("falls back to the empty key when there is no answer", () => {
    const bare = makeTask("a");
    expect(bucketKeyFor(bare, "tag", TODAY)).toBe("");
    expect(bucketKeyFor(bare, "person", TODAY)).toBe("");
    expect(bucketKeyFor(bare, "project", TODAY)).toBe("");
    expect(bucketKeyFor(bare, "priority", TODAY)).toBe("");
  });

  it("files by the note a task lives in", () => {
    const task = makeTask("a", { link: "work/plan.md" });
    expect(bucketKeyFor(task, "file", TODAY)).toBe("work/plan.md");
  });
});

describe("buildBuckets by status", () => {
  it("draws every status, even the empty ones", () => {
    const buckets = build([makeTask("a", { status: "todo" })], "status");
    expect(buckets.map((bucket) => bucket.key)).toEqual([
      "todo",
      "in_progress",
      "done",
      "canceled",
    ]);
    expect(buckets[0].tasks.map((task) => task.id)).toEqual(["a"]);
    expect(buckets[1].tasks).toEqual([]);
  });

  it("says what a drop would write", () => {
    const [todo] = build([], "status");
    expect(todo.change).toEqual({ field: "status", status: "todo" });
  });
});

describe("buildBuckets by due date", () => {
  it("leads with overdue work when there is any", () => {
    const buckets = build(
      [makeTask("late", { due: "2026-08-01" }), makeTask("soon")],
      "due"
    );
    expect(buckets[0].key).toBe("overdue");
    expect(buckets[0].tasks.map((task) => task.id)).toEqual(["late"]);
  });

  it("leaves the overdue column out when nothing is late", () => {
    const keys = build([makeTask("a")], "due").map((bucket) => bucket.key);
    expect(keys).not.toContain("overdue");
    expect(keys).toEqual([
      "today",
      "tomorrow",
      "this_week",
      "next_week",
      "later",
      "none",
    ]);
  });

  it("refuses drops onto overdue", () => {
    const buckets = build([makeTask("late", { due: "2026-08-01" })], "due");
    expect(buckets[0].change).toBeNull();
  });

  it("drops the rest-of-week column when the week is already over", () => {
    // A Saturday: the only day left in the week is tomorrow, which has a
    // column of its own
    const buckets = buildBuckets([], "due", {
      today: "2026-08-15",
      labels: LABELS,
    });
    expect(buckets.map((bucket) => bucket.key)).not.toContain("this_week");
  });

  it("clears the date when a card is dropped on no-date", () => {
    const buckets = build([], "due");
    const none = buckets.find((bucket) => bucket.key === "none");
    expect(none?.change).toEqual({ field: "due", due: null });
  });
});

describe("buildBuckets by tag, person and project", () => {
  it("sorts discovered columns by label and puts the leftovers last", () => {
    const buckets = build(
      [
        makeTask("a", { tags: ["ship"] }),
        makeTask("b"),
        makeTask("c", { tags: ["build"] }),
      ],
      "tag"
    );
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "#build",
      "#ship",
      "No tag",
    ]);
  });

  it("draws one card per task, not one per tag", () => {
    const buckets = build([makeTask("a", { tags: ["one", "two"] })], "tag");
    const drawn = buckets.flatMap((bucket) => bucket.tasks);
    expect(drawn).toHaveLength(1);
  });

  it("assigns to a person on drop and unassigns on the leftovers column", () => {
    const buckets = build(
      [makeTask("a", { people: ["Alice"] }), makeTask("b")],
      "person"
    );
    expect(buckets[0].change).toEqual({ field: "person", person: "Alice" });
    expect(buckets[1].change).toEqual({ field: "person", person: null });
  });

  it("takes no drops when grouped by something nothing can write", () => {
    const byProject = build(
      [makeTask("a", { projects: ["Apollo"] })],
      "project"
    );
    expect(byProject[0].change).toBeNull();

    const byFile = build([makeTask("a", { link: "work/plan.md" })], "file");
    expect(byFile[0].label).toBe("plan");
    expect(byFile[0].change).toBeNull();
  });

  it("orders priority columns highest first, with no priority last", () => {
    const buckets = build(
      [
        makeTask("a", { priority: "🔽" }),
        makeTask("b"),
        makeTask("c", { priority: "🔺" }),
      ],
      "priority"
    );
    expect(buckets.map((bucket) => bucket.key)).toEqual(["🔺", "🔽", ""]);
  });
});

describe("applyCardOrder", () => {
  it("follows the saved order and appends anything new", () => {
    const tasks = [makeTask("a"), makeTask("b"), makeTask("c")];
    const ordered = applyCardOrder(tasks, ["c", "a"]);
    expect(ordered.map((task) => task.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the given order when there is none saved", () => {
    const tasks = [makeTask("b"), makeTask("a")];
    expect(applyCardOrder(tasks).map((task) => task.id)).toEqual(["b", "a"]);
  });

  it("orders the cards inside a column", () => {
    const buckets = build(
      [
        makeTask("a", { status: "todo" }),
        makeTask("b", { status: "todo" }),
        makeTask("c", { status: "todo" }),
      ],
      "status",
      ["c", "b", "a"]
    );
    expect(buckets[0].tasks.map((task) => task.id)).toEqual(["c", "b", "a"]);
  });
});

describe("orderTasksByDue", () => {
  it("puts the earliest due date first", () => {
    const order = orderTasksByDue([
      makeTask("late", { due: "2026-09-01" }),
      makeTask("soon", { due: "2026-08-11" }),
    ]);
    expect(order).toEqual(["soon", "late"]);
  });

  it("puts undated cards after every dated one", () => {
    const order = orderTasksByDue([
      makeTask("undated"),
      makeTask("dated", { due: "2027-01-01" }),
    ]);
    expect(order).toEqual(["dated", "undated"]);
  });

  it("breaks ties on the task name", () => {
    const order = orderTasksByDue([
      makeTask("b", { summary: "beta", due: "2026-08-11" }),
      makeTask("a", { summary: "alpha", due: "2026-08-11" }),
    ]);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("assignSolePerson", () => {
  it("replaces the allocations with one person at the whole task", () => {
    const finance = assignSolePerson(
      { ...EMPTY_TASK_FINANCE, allocations: [{ person: "Bob", share: 0.5 }] },
      "Alice"
    );
    expect(finance.allocations).toEqual([{ person: "Alice", share: 1 }]);
  });

  it("clears the allocations when nobody has it", () => {
    const finance = assignSolePerson(
      { ...EMPTY_TASK_FINANCE, allocations: [{ person: "Bob", share: 1 }] },
      null
    );
    expect(finance.allocations).toEqual([]);
  });

  it("leaves the hours and expenses alone", () => {
    const finance = assignSolePerson(
      { ...EMPTY_TASK_FINANCE, totalHours: 12 },
      "Alice"
    );
    expect(finance.totalHours).toBe(12);
  });
});

describe("retagForBucket", () => {
  it("swaps the column's tag and keeps the others", () => {
    expect(retagForBucket(["build", "ship"], "build", "test")).toEqual([
      "ship",
      "test",
    ]);
  });

  it("adds a tag to an untagged task", () => {
    expect(retagForBucket([], "", "ship")).toEqual(["ship"]);
  });

  it("removes the tag when dropped on the untagged column", () => {
    expect(retagForBucket(["ship", "urgent"], "ship", null)).toEqual([
      "urgent",
    ]);
  });

  it("does not double up a tag the task already carries", () => {
    expect(retagForBucket(["build", "ship"], "build", "ship")).toEqual([
      "ship",
    ]);
  });
});

describe("edge cases", () => {
  it("returns nothing for an empty board with a dynamic grouping", () => {
    expect(build([], "tag")).toEqual([]);
  });

  it("still draws the fixed columns for an empty board", () => {
    expect(build([], "status")).toHaveLength(4);
  });

  it("survives an order naming tasks that are no longer there", () => {
    const buckets = build([makeTask("a")], "status", ["ghost", "a"]);
    expect(buckets[0].tasks.map((task) => task.id)).toEqual(["a"]);
  });
});
