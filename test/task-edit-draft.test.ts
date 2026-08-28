import { DataviewTask } from "../src/types/dataview-task";
import { RateBook } from "../src/lib/rate-book";
import {
  TaskEditDraft,
  contributorLines,
  draftChanged,
  draftDays,
  draftFromTask,
  draftHours,
  draftTotals,
  financeChanged,
  financeFromDraft,
  sharesLookWrong,
  totalShare,
  validateDraft,
} from "../src/lib/task-edit-draft";

const BOOK: RateBook = {
  grades: [{ name: "Senior", rate: 100 }],
  people: [
    // Alice is priced through her grade, Bob by an override on himself
    { name: "Alice", grade: "Senior", rateOverride: null },
    { name: "Bob", grade: null, rateOverride: 50 },
  ],
  problems: [],
};

const COST = {
  book: BOOK,
  defaultHoursPerDay: 8,
  skipWeekends: false,
};

function draft(overrides: Partial<TaskEditDraft> = {}): TaskEditDraft {
  return {
    text: "Fit the loom",
    status: "todo",
    start: null,
    due: null,
    progress: null,
    owner: null,
    allocations: [],
    expenses: [],
    hoursPerDay: null,
    totalHours: null,
    parentId: null,
    dependsOn: [],
    tags: [],
    ...overrides,
  };
}

describe("draftFromTask", () => {
  it("reads every property off the task", () => {
    const task = new DataviewTask({
      id: "abc123",
      summary: "Fit the loom",
      text: "Fit the loom 🆔 abc123",
      tags: ["shop"],
      status: "in_progress",
      priority: "",
      link: "tasks/list.md",
      incomingLinks: ["d4e5f6"],
      starred: false,
      dates: [
        { type: "start", date: "2026-08-17" },
        { type: "due", date: "2026-09-04" },
      ],
      finance: {
        hoursPerDay: 6,
        totalHours: null,
        allocations: [{ person: "Alice", share: 0.6 }],
        expenses: [{ description: "Loom kit", amount: 240 }],
      },
      progress: { percent: 35 },
      owner: "Alice",
      parentId: "xyz789",
    });

    expect(draftFromTask(task)).toEqual({
      text: "Fit the loom",
      status: "in_progress",
      start: "2026-08-17",
      due: "2026-09-04",
      progress: 35,
      owner: "Alice",
      allocations: [{ person: "Alice", share: 0.6 }],
      expenses: [{ description: "Loom kit", amount: 240 }],
      hoursPerDay: 6,
      totalHours: null,
      parentId: "xyz789",
      dependsOn: ["d4e5f6"],
      tags: ["shop"],
    });
  });

  it("copies the lists, so editing the draft cannot reach the task", () => {
    const task = new DataviewTask({
      id: "abc123",
      summary: "Fit the loom",
      text: "Fit the loom",
      tags: ["shop"],
      status: "todo",
      priority: "",
      link: "tasks/list.md",
      incomingLinks: [],
      starred: false,
      finance: {
        hoursPerDay: null,
        totalHours: null,
        allocations: [{ person: "Alice", share: 1 }],
        expenses: [],
      },
    });

    const edited = draftFromTask(task);
    edited.tags.push("new");
    edited.allocations[0].share = 0.5;

    expect(task.tags).toEqual(["shop"]);
    expect(task.finance.allocations[0].share).toBe(1);
  });
});

describe("financeFromDraft", () => {
  it("drops a contributor row nobody has been named in yet", () => {
    const finance = financeFromDraft(
      draft({
        allocations: [
          { person: "Alice", share: 0.6 },
          { person: "  ", share: 0.4 },
        ],
      })
    );

    expect(finance.allocations).toEqual([{ person: "Alice", share: 0.6 }]);
  });

  it("drops an expense with no description", () => {
    const finance = financeFromDraft(
      draft({ expenses: [{ description: "", amount: 50 }] })
    );

    expect(finance.expenses).toEqual([]);
  });
});

describe("draftDays", () => {
  it("counts the days between the two dates", () => {
    expect(
      draftDays(draft({ start: "2026-08-17", due: "2026-08-21" }), false)
    ).toBe(5);
  });

  it("is zero when either end is missing", () => {
    // A task with no dates has no length; the hours it would imply are not a
    // number anybody should be shown
    expect(draftDays(draft({ start: "2026-08-17" }), false)).toBe(0);
    expect(draftDays(draft({ due: "2026-08-21" }), false)).toBe(0);
    expect(draftDays(draft(), false)).toBe(0);
  });
});

describe("draftHours", () => {
  it("takes an explicit total over anything worked out", () => {
    const result = draftHours(
      draft({ totalHours: 48, start: "2026-08-17", due: "2026-08-21" }),
      COST
    );

    expect(result).toEqual({ hours: 48, source: "explicit" });
  });

  it("works the hours out from the length and the rate per day", () => {
    const result = draftHours(
      draft({ start: "2026-08-17", due: "2026-08-21" }),
      COST
    );

    expect(result).toEqual({ hours: 40, source: "per-day" });
  });

  it("uses the task's own hours-per-day over the default", () => {
    const result = draftHours(
      draft({ start: "2026-08-17", due: "2026-08-21", hoursPerDay: 4 }),
      COST
    );

    expect(result.hours).toBe(20);
  });

  it("honours a zero total rather than falling back", () => {
    // A zero-hour placeholder task is a real thing to want
    const result = draftHours(draft({ totalHours: 0 }), COST);
    expect(result).toEqual({ hours: 0, source: "explicit" });
  });
});

describe("contributorLines", () => {
  it("splits the hours and prices them", () => {
    const lines = contributorLines(
      draft({
        totalHours: 100,
        allocations: [
          { person: "Alice", share: 0.6 },
          { person: "Bob", share: 0.4 },
        ],
      }),
      COST
    );

    expect(lines[0]).toEqual({
      person: "Alice",
      share: 0.6,
      hours: 60,
      rate: 100,
      cost: 6000,
    });
    expect(lines[1].cost).toBe(2000);
  });

  it("reports an unpriced person rather than guessing a rate", () => {
    const lines = contributorLines(
      draft({ totalHours: 10, allocations: [{ person: "Carol", share: 1 }] }),
      COST
    );

    expect(lines[0].rate).toBeNull();
    expect(lines[0].cost).toBe(0);
  });

  it("uses shares exactly as written, without scaling them to 100%", () => {
    // Scaling would hide a typo and quietly inflate the plan
    const lines = contributorLines(
      draft({
        totalHours: 100,
        allocations: [
          { person: "Alice", share: 0.6 },
          { person: "Bob", share: 0.3 },
        ],
      }),
      COST
    );

    expect(lines[0].hours).toBe(60);
    expect(lines[1].hours).toBe(30);
  });
});

describe("totalShare and sharesLookWrong", () => {
  it("adds the shares up", () => {
    expect(
      totalShare(
        draft({
          allocations: [
            { person: "Alice", share: 0.6 },
            { person: "Bob", share: 0.4 },
          ],
        })
      )
    ).toBeCloseTo(1);
  });

  it("says nothing about a task with nobody on it", () => {
    expect(sharesLookWrong(draft())).toBe(false);
  });

  it("flags shares that do not add up", () => {
    expect(
      sharesLookWrong(
        draft({
          allocations: [
            { person: "Alice", share: 0.6 },
            { person: "Bob", share: 0.3 },
          ],
        })
      )
    ).toBe(true);
  });

  it("treats a rounding-sized gap as fine", () => {
    expect(
      sharesLookWrong(
        draft({ allocations: [{ person: "Alice", share: 0.999 }] })
      )
    ).toBe(false);
  });
});

describe("draftTotals", () => {
  it("adds labour and materials", () => {
    const totals = draftTotals(
      draft({
        totalHours: 10,
        allocations: [{ person: "Alice", share: 1 }],
        expenses: [{ description: "Loom kit", amount: 240 }],
      }),
      COST
    );

    expect(totals).toEqual({ labour: 1000, materials: 240, total: 1240 });
  });
});

describe("validateDraft", () => {
  const options = { canEditText: true };

  it("passes a draft with nothing wrong with it", () => {
    expect(validateDraft(draft(), options)).toBeNull();
  });

  it("refuses an empty name", () => {
    expect(validateDraft(draft({ text: "  " }), options)).toBe("text-required");
  });

  it("allows an empty name on a task that is named by its file", () => {
    expect(
      validateDraft(draft({ text: "" }), { canEditText: false })
    ).toBeNull();
  });

  it("refuses a date that is not one", () => {
    expect(validateDraft(draft({ due: "sometime" }), options)).toBe(
      "date-invalid"
    );
  });

  it("refuses an end before its start", () => {
    expect(
      validateDraft(draft({ start: "2026-09-04", due: "2026-08-17" }), options)
    ).toBe("dates-backwards");
  });

  it("allows a task that starts and ends the same day", () => {
    expect(
      validateDraft(draft({ start: "2026-08-17", due: "2026-08-17" }), options)
    ).toBeNull();
  });

  it("allows shares that do not total 100%", () => {
    // A legitimate state to save something in; the dialog says so beside the
    // field rather than refusing the save
    expect(
      validateDraft(
        draft({ allocations: [{ person: "Alice", share: 0.6 }] }),
        options
      )
    ).toBeNull();
  });
});

describe("draftChanged", () => {
  it("says nothing changed when nothing did", () => {
    expect(draftChanged(draft(), draft())).toBe(false);
  });

  it.each([
    ["the name", { text: "Something else" }],
    ["the status", { status: "done" as const }],
    ["a date", { due: "2026-09-04" }],
    ["progress", { progress: 35 }],
    ["the owner", { owner: "Alice" }],
    ["the parent", { parentId: "xyz789" }],
    ["hours", { totalHours: 48 }],
    ["contributors", { allocations: [{ person: "Alice", share: 1 }] }],
    ["expenses", { expenses: [{ description: "Kit", amount: 10 }] }],
    ["dependencies", { dependsOn: ["d4e5f6"] }],
    ["tags", { tags: ["shop"] }],
  ])("notices a change to %s", (_case, patch) => {
    expect(draftChanged(draft(patch), draft())).toBe(true);
  });

  it("notices a share moving even when the people are the same", () => {
    expect(
      draftChanged(
        draft({ allocations: [{ person: "Alice", share: 0.6 }] }),
        draft({ allocations: [{ person: "Alice", share: 0.4 }] })
      )
    ).toBe(true);
  });
});

describe("financeChanged", () => {
  it("ignores a change that is not about money", () => {
    expect(financeChanged(draft({ owner: "Alice" }), draft())).toBe(false);
  });

  it("notices a contributor arriving", () => {
    expect(
      financeChanged(
        draft({ allocations: [{ person: "Alice", share: 1 }] }),
        draft()
      )
    ).toBe(true);
  });

  it("notices the hours moving", () => {
    expect(financeChanged(draft({ totalHours: 48 }), draft())).toBe(true);
  });
});
