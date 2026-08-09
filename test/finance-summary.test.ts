import { GanttRow } from "../src/lib/gantt-rows";
import { parseRateBook } from "../src/lib/rate-book";
import {
  ReportOptions,
  buildCostReport,
  costOverTime,
  groupCosts,
  topCostDrivers,
} from "../src/lib/finance-summary";
import { EMPTY_TASK_FINANCE, TaskFinance } from "../src/lib/task-finance";
import { DataviewTask } from "../src/types/dataview-task";
import { TaskStatus } from "../src/types/task";

const BOOK = parseRateBook(`| Grade | Rate |
| --- | --- |
| Principal | 100 |
| Engineer | 50 |

| Person | Grade |
| --- | --- |
| Alice | Principal |
| Bob | Engineer |
`);

const OPTIONS: ReportOptions = {
  defaultHoursPerDay: 8,
  skipWeekends: false,
  includeInferred: true,
};

interface RowSpec {
  id: string;
  start?: string;
  end?: string;
  inferred?: boolean;
  finance?: Partial<TaskFinance>;
  tags?: string[];
  projects?: string[];
  status?: TaskStatus;
  link?: string;
}

function row(spec: RowSpec): GanttRow {
  const start = spec.start ?? "2026-03-02";
  const end = spec.end ?? "2026-03-02";

  const task = new DataviewTask({
    id: spec.id,
    summary: spec.id,
    text: spec.id,
    tags: spec.tags ?? [],
    status: spec.status ?? "todo",
    priority: "",
    link: spec.link ?? "plans/a.md",
    incomingLinks: [],
    starred: false,
    projects: spec.projects ?? [],
    dates: [],
    finance: { ...EMPTY_TASK_FINANCE, ...spec.finance },
  });

  return {
    task,
    bar: {
      id: spec.id,
      start,
      end,
      startInferred: spec.inferred ?? false,
      endInferred: spec.inferred ?? false,
    },
    inferred: spec.inferred ?? false,
  };
}

/** 10 hours of Alice at 100 = 1000, plus 200 of materials. */
const PRICED = {
  totalHours: 10,
  allocations: [{ person: "Alice", share: 1 }],
  expenses: [{ description: "Kit", amount: 200 }],
};

describe("buildCostReport", () => {
  it("totals labour and materials", () => {
    const report = buildCostReport(
      [row({ id: "a", finance: PRICED })],
      BOOK,
      OPTIONS
    );

    expect(report.labour).toBe(1000);
    expect(report.materials).toBe(200);
    expect(report.total).toBe(1200);
    expect(report.hours).toBe(10);
    expect(report.pricedTasks).toBe(1);
  });

  it("counts tasks with no finance data separately and excludes them", () => {
    const report = buildCostReport(
      [row({ id: "a", finance: PRICED }), row({ id: "b" })],
      BOOK,
      OPTIONS
    );

    expect(report.tasksWithoutFinance).toBe(1);
    expect(report.total).toBe(1200);
  });

  it("keeps a cost for every row, even excluded ones", () => {
    const report = buildCostReport(
      [row({ id: "a", finance: PRICED }), row({ id: "b" })],
      BOOK,
      OPTIONS
    );

    expect([...report.costs.keys()]).toEqual(["a", "b"]);
  });

  it("reports cost sitting on suggested dates", () => {
    const report = buildCostReport(
      [row({ id: "a", finance: PRICED, inferred: true })],
      BOOK,
      OPTIONS
    );

    expect(report.total).toBe(1200);
    expect(report.inferredTotal).toBe(1200);
    expect(report.inferredTaskCount).toBe(1);
  });

  it("leaves suggested dates out of the total when asked", () => {
    const report = buildCostReport(
      [
        row({ id: "a", finance: PRICED }),
        row({ id: "b", finance: PRICED, inferred: true }),
      ],
      BOOK,
      { ...OPTIONS, includeInferred: false }
    );

    expect(report.total).toBe(1200);
    // Still reported, so the dashboard can say what it left out
    expect(report.inferredTotal).toBe(1200);
    expect(report.inferredTaskCount).toBe(1);
  });

  it("gathers issues with the task they came from", () => {
    const report = buildCostReport(
      [
        row({
          id: "a",
          finance: {
            totalHours: 4,
            allocations: [{ person: "Nobody", share: 1 }],
          },
        }),
      ],
      BOOK,
      OPTIONS
    );

    expect(report.issues).toContainEqual({
      taskId: "a",
      summary: "a",
      issue: { kind: "unknown-person", person: "Nobody" },
    });
    expect(report.unpricedHours).toBe(4);
  });

  it("counts a task that produced nothing as unpriced", () => {
    const report = buildCostReport(
      [row({ id: "a", finance: { totalHours: 4 } })],
      BOOK,
      OPTIONS
    );

    expect(report.pricedTasks).toBe(0);
    expect(report.unpricedTasks).toBe(1);
  });

  it("reports nothing for no rows", () => {
    const report = buildCostReport([], BOOK, OPTIONS);

    expect(report.total).toBe(0);
    expect(report.issues).toEqual([]);
  });
});

describe("groupCosts", () => {
  const rows = [
    row({
      id: "a",
      tags: ["build"],
      projects: ["Loom"],
      status: "todo",
      link: "plans/a.md",
      finance: {
        totalHours: 10,
        allocations: [
          { person: "Alice", share: 0.5 },
          { person: "Bob", share: 0.5 },
        ],
        expenses: [{ description: "Kit", amount: 200 }],
      },
    }),
    row({
      id: "b",
      tags: ["test"],
      projects: ["Loom"],
      status: "done",
      link: "plans/b.md",
      finance: { totalHours: 10, allocations: [{ person: "Bob", share: 1 }] },
    }),
  ];

  const report = buildCostReport(rows, BOOK, OPTIONS);

  it("splits labour between people", () => {
    const groups = groupCosts(report, rows, "person", OPTIONS);

    expect(groups.find((g) => g.key === "Alice")?.labour).toBe(500);
    expect(groups.find((g) => g.key === "Bob")?.labour).toBe(250 + 500);
  });

  it("parks materials under the empty key so the parts add up", () => {
    const groups = groupCosts(report, rows, "person", OPTIONS);
    const sum = groups.reduce((total, g) => total + g.total, 0);

    expect(groups.find((g) => g.key === "")?.materials).toBe(200);
    expect(sum).toBe(report.total);
  });

  it("groups by grade", () => {
    const groups = groupCosts(report, rows, "grade", OPTIONS);

    expect(groups.find((g) => g.key === "Principal")?.labour).toBe(500);
    expect(groups.find((g) => g.key === "Engineer")?.labour).toBe(750);
  });

  it.each([
    ["project", "Loom", 1450],
    ["tag", "build", 950],
    ["status", "todo", 950],
    ["file", "plans/a.md", 950],
  ] as const)("groups by %s", (dimension, key, total) => {
    const groups = groupCosts(report, rows, dimension, OPTIONS);

    expect(groups.find((g) => g.key === key)?.total).toBe(total);
  });

  it("files a task with several tags under one of them", () => {
    const multi = [
      row({
        id: "a",
        tags: ["zeta", "alpha"],
        finance: { totalHours: 10, allocations: [{ person: "Bob", share: 1 }] },
      }),
    ];
    const multiReport = buildCostReport(multi, BOOK, OPTIONS);
    const groups = groupCosts(multiReport, multi, "tag", OPTIONS);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("alpha");
  });

  it("sorts biggest first", () => {
    const groups = groupCosts(report, rows, "person", OPTIONS);

    expect(groups.map((g) => g.total)).toEqual(
      [...groups.map((g) => g.total)].sort((a, b) => b - a)
    );
  });

  it("returns nothing for rows with no cost", () => {
    expect(groupCosts(report, [row({ id: "z" })], "person", OPTIONS)).toEqual(
      []
    );
  });
});

describe("costOverTime", () => {
  it("spreads a task's cost evenly across its bar", () => {
    const rows = [
      row({
        id: "a",
        start: "2026-03-02",
        end: "2026-03-11",
        finance: {
          totalHours: 10,
          allocations: [{ person: "Alice", share: 1 }],
        },
      }),
    ];
    const report = buildCostReport(rows, BOOK, OPTIONS);
    const buckets = costOverTime(report, rows, "week", OPTIONS);

    expect(buckets).toHaveLength(2);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBeCloseTo(1000);
  });

  it("keeps labour and materials apart", () => {
    const rows = [row({ id: "a", finance: PRICED })];
    const report = buildCostReport(rows, BOOK, OPTIONS);
    const [bucket] = costOverTime(report, rows, "month", OPTIONS);

    expect(bucket.labour).toBeCloseTo(1000);
    expect(bucket.materials).toBeCloseTo(200);
  });

  it("keeps empty buckets in the middle so the axis stays to scale", () => {
    const rows = [
      row({ id: "a", start: "2026-01-05", end: "2026-01-05", finance: PRICED }),
      row({ id: "b", start: "2026-04-06", end: "2026-04-06", finance: PRICED }),
    ];
    const report = buildCostReport(rows, BOOK, OPTIONS);
    const buckets = costOverTime(report, rows, "month", OPTIONS);

    expect(buckets.map((b) => b.start)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(buckets[1].total).toBe(0);
  });

  it("spreads over working days only when the Gantt skips weekends", () => {
    const rows = [
      row({
        id: "a",
        start: "2026-03-07", // Saturday
        end: "2026-03-08", // Sunday
        finance: PRICED,
      }),
    ];
    const options = { ...OPTIONS, skipWeekends: true };
    const report = buildCostReport(rows, BOOK, options);
    const buckets = costOverTime(report, rows, "week", options);

    // Nothing but weekend, so it still has to land somewhere
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBeGreaterThan(0);
  });

  it("returns nothing when there is no cost", () => {
    expect(
      costOverTime(buildCostReport([], BOOK, OPTIONS), [], "week", OPTIONS)
    ).toEqual([]);
  });
});

describe("topCostDrivers", () => {
  const rows = [
    row({
      id: "small",
      finance: { totalHours: 1, allocations: [{ person: "Bob", share: 1 }] },
    }),
    row({
      id: "big",
      finance: {
        totalHours: 100,
        allocations: [{ person: "Alice", share: 1 }],
      },
    }),
    row({ id: "none" }),
  ];
  const report = buildCostReport(rows, BOOK, OPTIONS);

  it("puts the biggest first", () => {
    expect(
      topCostDrivers(report, rows, 10, OPTIONS).map((e) => e.row.task.id)
    ).toEqual(["big", "small"]);
  });

  it("leaves out tasks that cost nothing", () => {
    expect(
      topCostDrivers(report, rows, 10, OPTIONS).map((e) => e.row.task.id)
    ).not.toContain("none");
  });

  it("honours the limit", () => {
    expect(topCostDrivers(report, rows, 1, OPTIONS)).toHaveLength(1);
  });
});
