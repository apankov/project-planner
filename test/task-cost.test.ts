import { parseRateBook } from "../src/lib/rate-book";
import { computeTaskCost, resolveTaskHours } from "../src/lib/task-cost";
import { EMPTY_TASK_FINANCE, TaskFinance } from "../src/lib/task-finance";

const BOOK = parseRateBook(`| Grade | Rate |
| --- | --- |
| Principal | 145 |
| Engineer | 85 |
| Archmage | |

| Person | Grade | Rate |
| --- | --- | --- |
| Alice Smith | Principal | |
| Bob Jones | Engineer | |
| Cara Diaz | Engineer | 130 |
| Dan Fox | Archmage | |
`);

const OPTIONS = { defaultHoursPerDay: 8, skipWeekends: false };

function finance(overrides: Partial<TaskFinance> = {}): TaskFinance {
  return { ...EMPTY_TASK_FINANCE, allocations: [], expenses: [], ...overrides };
}

/** Monday to Friday 2026-03-02..06, then the weekend. */
function cost(
  f: TaskFinance,
  options = OPTIONS,
  range: { start: string; end: string; inferred?: boolean } = {
    start: "2026-03-02",
    end: "2026-03-06",
  }
) {
  return computeTaskCost(
    {
      taskId: "t1",
      finance: f,
      start: range.start,
      end: range.end,
      inferred: range.inferred ?? false,
    },
    BOOK,
    options
  );
}

describe("resolveTaskHours", () => {
  it("uses an explicit total ahead of everything", () => {
    expect(
      resolveTaskHours(finance({ totalHours: 12, hoursPerDay: 6 }), 5, 8)
    ).toEqual({ hours: 12, source: "explicit" });
  });

  it("multiplies the task's own hours per day by the days", () => {
    expect(resolveTaskHours(finance({ hoursPerDay: 6 }), 5, 8)).toEqual({
      hours: 30,
      source: "per-day",
    });
  });

  it("falls back to the global default", () => {
    expect(resolveTaskHours(finance(), 5, 8)).toEqual({
      hours: 40,
      source: "per-day",
    });
  });

  it("honours an explicit zero total", () => {
    expect(resolveTaskHours(finance({ totalHours: 0 }), 5, 8).hours).toBe(0);
  });

  it("honours zero hours per day rather than falling back", () => {
    expect(resolveTaskHours(finance({ hoursPerDay: 0 }), 5, 8).hours).toBe(0);
  });
});

describe("computeTaskCost", () => {
  it("costs hours at the grade's rate", () => {
    const result = cost(
      finance({ allocations: [{ person: "Alice Smith", share: 1 }] })
    );

    // Mon to Fri inclusive is 5 days, so 5 x 8h at 145
    expect(result.days).toBe(5);
    expect(result.hours).toBe(40);
    expect(result.labour).toBe(40 * 145);
    expect(result.total).toBe(40 * 145);
    expect(result.issues).toEqual([]);
  });

  it("splits hours between people by share", () => {
    const result = cost(
      finance({
        totalHours: 100,
        allocations: [
          { person: "Alice Smith", share: 0.6 },
          { person: "Bob Jones", share: 0.4 },
        ],
      })
    );

    expect(result.lines.map((l) => l.hours)).toEqual([60, 40]);
    expect(result.labour).toBe(60 * 145 + 40 * 85);
    expect(result.issues).toEqual([]);
  });

  it("prefers a person's own rate over their grade's", () => {
    const result = cost(
      finance({
        totalHours: 10,
        allocations: [{ person: "Cara Diaz", share: 1 }],
      })
    );

    expect(result.labour).toBe(1300);
  });

  describe("days", () => {
    it("counts calendar days across a weekend", () => {
      expect(
        cost(finance(), OPTIONS, { start: "2026-03-02", end: "2026-03-08" })
          .days
      ).toBe(7);
    });

    it("counts working days when the Gantt skips weekends", () => {
      expect(
        cost(
          finance(),
          { ...OPTIONS, skipWeekends: true },
          { start: "2026-03-02", end: "2026-03-08" }
        ).days
      ).toBe(5);
    });

    it("changes the hours with it", () => {
      const calendar = cost(finance(), OPTIONS, {
        start: "2026-03-02",
        end: "2026-03-08",
      });
      const working = cost(
        finance(),
        { ...OPTIONS, skipWeekends: true },
        { start: "2026-03-02", end: "2026-03-08" }
      );

      expect(calendar.hours).toBe(56);
      expect(working.hours).toBe(40);
    });
  });

  describe("missing data", () => {
    it("costs an unknown person at nothing and says so", () => {
      const result = cost(
        finance({
          totalHours: 10,
          allocations: [{ person: "Nobody", share: 1 }],
        })
      );

      expect(result.labour).toBe(0);
      expect(result.unpricedHours).toBe(10);
      expect(result.issues).toContainEqual({
        kind: "unknown-person",
        person: "Nobody",
      });
    });

    it("tells a known person with no rate apart from an unknown one", () => {
      const result = cost(
        finance({
          totalHours: 10,
          allocations: [{ person: "Dan Fox", share: 1 }],
        })
      );

      expect(result.labour).toBe(0);
      expect(result.unpricedHours).toBe(10);
      expect(result.issues).toContainEqual({
        kind: "no-rate",
        person: "Dan Fox",
        grade: "Archmage",
      });
    });

    it("reports a task with hours but nobody on it", () => {
      const result = cost(finance({ totalHours: 10 }));

      expect(result.labour).toBe(0);
      expect(result.unallocatedHours).toBe(10);
      expect(result.issues).toContainEqual({ kind: "no-allocations" });
    });

    it("uses shares that fall short exactly as written", () => {
      const result = cost(
        finance({
          totalHours: 10,
          allocations: [
            { person: "Alice Smith", share: 0.6 },
            { person: "Bob Jones", share: 0.3 },
          ],
        })
      );

      expect(result.labour).toBe(6 * 145 + 3 * 85);
      expect(result.unallocatedHours).toBeCloseTo(1);
      expect(result.issues).toContainEqual({
        kind: "allocations-off",
        total: 0.8999999999999999,
      });
    });

    it("allows two people at full time without capping", () => {
      const result = cost(
        finance({
          totalHours: 10,
          allocations: [
            { person: "Alice Smith", share: 1 },
            { person: "Bob Jones", share: 1 },
          ],
        })
      );

      expect(result.labour).toBe(10 * 145 + 10 * 85);
      expect(result.unallocatedHours).toBe(0);
      expect(result.issues).toContainEqual({
        kind: "allocations-off",
        total: 2,
      });
    });

    it("does not complain about rounding in the shares", () => {
      const result = cost(
        finance({
          totalHours: 9,
          allocations: [
            { person: "Alice Smith", share: 0.333 },
            { person: "Bob Jones", share: 0.333 },
            { person: "Cara Diaz", share: 0.334 },
          ],
        })
      );

      expect(result.issues).toEqual([]);
    });
  });

  describe("materials", () => {
    it("adds expenses on top of labour", () => {
      const result = cost(
        finance({
          totalHours: 10,
          allocations: [{ person: "Bob Jones", share: 1 }],
          expenses: [
            { description: "Loom kit", amount: 240 },
            { description: "Travel", amount: 85 },
          ],
        })
      );

      expect(result.labour).toBe(850);
      expect(result.materials).toBe(325);
      expect(result.total).toBe(1175);
    });

    it("counts expenses on a task with nobody on it", () => {
      const result = cost(
        finance({ expenses: [{ description: "Bolts", amount: 20 }] })
      );

      expect(result.materials).toBe(20);
      expect(result.total).toBe(20);
    });

    it("subtracts a credit", () => {
      const result = cost(
        finance({
          expenses: [
            { description: "Kit", amount: 100 },
            { description: "Rebate", amount: -40 },
          ],
        })
      );

      expect(result.materials).toBe(60);
    });
  });

  it("flags a bar whose dates were only suggested", () => {
    const result = cost(finance({ totalHours: 1 }), OPTIONS, {
      start: "2026-03-02",
      end: "2026-03-02",
      inferred: true,
    });

    expect(result.inferred).toBe(true);
    expect(result.issues).toContainEqual({ kind: "inferred-schedule" });
  });

  it("costs a task with no finance data at nothing", () => {
    const result = cost(EMPTY_TASK_FINANCE);

    expect(result.total).toBe(0);
    expect(result.labour).toBe(0);
    expect(result.materials).toBe(0);
  });
});
