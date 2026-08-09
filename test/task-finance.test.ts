import {
  FINANCE_FIELD_REMOVAL,
  financeFrontmatterPatch,
  formatAllocationList,
  formatExpenseList,
  getFrontmatterFinance,
  getTaskFinance,
  hasFinanceData,
  parseAllocationList,
  parseExpenseList,
  writeFinanceToTaskLine,
} from "../src/lib/task-finance";

describe("getTaskFinance", () => {
  it("reads all four fields off one line", () => {
    const finance = getTaskFinance(
      "- [ ] Fit the loom [hoursPerDay:: 6] [people:: Alice Smith 60%, Bob Jones 40%] [costs:: Loom kit 240, Travel 85] 🆔 a1b2c3"
    );

    expect(finance.hoursPerDay).toBe(6);
    expect(finance.totalHours).toBeNull();
    expect(finance.allocations).toEqual([
      { person: "Alice Smith", share: 0.6 },
      { person: "Bob Jones", share: 0.4 },
    ]);
    expect(finance.expenses).toEqual([
      { description: "Loom kit", amount: 240 },
      { description: "Travel", amount: 85 },
    ]);
  });

  it("reads a task with no finance data as empty", () => {
    const finance = getTaskFinance("- [ ] Plain task 📅 2026-03-06");

    expect(finance).toEqual({
      hoursPerDay: null,
      totalHours: null,
      allocations: [],
      expenses: [],
    });
    expect(hasFinanceData(finance)).toBe(false);
  });

  it.each([
    ["[hours:: 12]", 12],
    ["(hours:: 12)", 12],
    ["[totalHours:: 12]", 12],
    ["[estimatedHours:: 12]", 12],
    ["[HOURS:: 12]", 12],
  ])("accepts %s as an explicit total", (field, expected) => {
    expect(getTaskFinance(`- [ ] Task ${field}`).totalHours).toBe(expected);
  });

  it.each(["[hoursPerDay:: 6]", "[hours-per-day:: 6]", "[hoursperday:: 6]"])(
    "accepts %s as a per-day override",
    (field) => {
      expect(getTaskFinance(`- [ ] Task ${field}`).hoursPerDay).toBe(6);
    }
  );

  it.each(["people", "allocations", "who"])(
    "accepts %s for allocations",
    (name) => {
      expect(
        getTaskFinance(`- [ ] Task [${name}:: Alice 50%]`).allocations
      ).toEqual([{ person: "Alice", share: 0.5 }]);
    }
  );

  it.each(["costs", "expenses", "materials"])(
    "accepts %s for expenses",
    (name) => {
      expect(
        getTaskFinance(`- [ ] Task [${name}:: Bolts 20]`).expenses
      ).toEqual([{ description: "Bolts", amount: 20 }]);
    }
  );

  it("does not mistake hoursPerDay for hours", () => {
    const finance = getTaskFinance("- [ ] Task [hoursPerDay:: 6]");

    expect(finance.totalHours).toBeNull();
    expect(finance.hoursPerDay).toBe(6);
  });

  it("keeps an explicit zero rather than falling back", () => {
    const finance = getTaskFinance("- [ ] Task [hours:: 0] [hoursPerDay:: 0]");

    expect(finance.totalHours).toBe(0);
    expect(finance.hoursPerDay).toBe(0);
  });

  it("drops a negative hours value", () => {
    expect(getTaskFinance("- [ ] Task [hours:: -4]").totalHours).toBeNull();
  });
});

describe("parseAllocationList", () => {
  it.each([
    ["Alice 60%", 0.6],
    ["Alice 60", 0.6],
    ["Alice 0.6", 0.6],
    ["Alice 100%", 1],
    ["Alice 100", 1],
    ["Alice 1", 1],
  ])("reads %s as a fraction", (entry, share) => {
    expect(parseAllocationList(entry)).toEqual([{ person: "Alice", share }]);
  });

  it("reads a name with no number as the whole task", () => {
    expect(parseAllocationList("Alice Smith")).toEqual([
      { person: "Alice Smith", share: 1 },
    ]);
  });

  it("keeps names with spaces intact", () => {
    expect(parseAllocationList("Alice Van Der Berg 25%")).toEqual([
      { person: "Alice Van Der Berg", share: 0.25 },
    ]);
  });

  it("strips wiki-link brackets off a name", () => {
    expect(parseAllocationList("[[Alice Smith]] 60%")).toEqual([
      { person: "Alice Smith", share: 0.6 },
    ]);
  });

  it("uses a wiki-link's display text", () => {
    expect(parseAllocationList("[[People/Alice|Alice Smith]] 60%")).toEqual([
      { person: "Alice Smith", share: 0.6 },
    ]);
  });

  it("separates on semicolons too", () => {
    expect(parseAllocationList("Alice 60%; Bob 40%")).toEqual([
      { person: "Alice", share: 0.6 },
      { person: "Bob", share: 0.4 },
    ]);
  });

  it("does not read a trailing word as a share", () => {
    expect(parseAllocationList("Team Q4")).toEqual([
      { person: "Team Q4", share: 1 },
    ]);
  });

  it("keeps the siblings of a malformed entry", () => {
    expect(parseAllocationList("Alice 60%, , Bob 40%")).toEqual([
      { person: "Alice", share: 0.6 },
      { person: "Bob", share: 0.4 },
    ]);
  });

  it("never normalises shares that do not add up", () => {
    const allocations = parseAllocationList("Alice 60%, Bob 30%");

    expect(allocations.reduce((sum, a) => sum + a.share, 0)).toBeCloseTo(0.9);
  });

  it("allows shares over 100%", () => {
    expect(parseAllocationList("Alice 100%, Bob 100%")).toEqual([
      { person: "Alice", share: 1 },
      { person: "Bob", share: 1 },
    ]);
  });
});

describe("parseExpenseList", () => {
  it("reads a description and an amount", () => {
    expect(parseExpenseList("CAD licence renewal 250")).toEqual([
      { description: "CAD licence renewal", amount: 250 },
    ]);
  });

  it("keeps a thousands separator inside a number", () => {
    expect(parseExpenseList("Loom kit 1,200")).toEqual([
      { description: "Loom kit", amount: 1200 },
    ]);
  });

  it("ignores a currency symbol", () => {
    expect(parseExpenseList("Travel £85")).toEqual([
      { description: "Travel", amount: 85 },
    ]);
  });

  it("keeps a negative amount as a credit", () => {
    expect(parseExpenseList("Rebate -40")).toEqual([
      { description: "Rebate", amount: -40 },
    ]);
  });

  it("drops an entry with no amount but keeps its siblings", () => {
    expect(parseExpenseList("Mystery item, Bolts 20")).toEqual([
      { description: "Bolts", amount: 20 },
    ]);
  });

  it("reads decimals", () => {
    expect(parseExpenseList("Postage 12.50")).toEqual([
      { description: "Postage", amount: 12.5 },
    ]);
  });
});

describe("round tripping", () => {
  it.each([
    "Alice Smith 60%, Bob Jones 40%",
    "Alice 100%",
    "Alice Van Der Berg 25%, Bob 75%",
  ])("formats %s back to what it parsed from", (value) => {
    expect(formatAllocationList(parseAllocationList(value))).toBe(value);
  });

  it.each(["Loom kit 240, Travel 85", "Postage 12.5"])(
    "formats %s back to what it parsed from",
    (value) => {
      expect(formatExpenseList(parseExpenseList(value))).toBe(value);
    }
  );

  it("survives a full line round trip", () => {
    const line =
      "- [ ] Fit the loom [hours:: 12] [people:: Alice 60%, Bob 40%] 🆔 a1b2c3";
    const finance = getTaskFinance(line);

    expect(getTaskFinance(writeFinanceToTaskLine(line, finance))).toEqual(
      finance
    );
  });
});

describe("writeFinanceToTaskLine", () => {
  it("appends fields to a line that had none", () => {
    const line = writeFinanceToTaskLine("- [ ] Fit the loom 🆔 a1b2c3", {
      hoursPerDay: 6,
      totalHours: null,
      allocations: [{ person: "Alice", share: 0.6 }],
      expenses: [],
    });

    expect(line).toBe(
      "- [ ] Fit the loom 🆔 a1b2c3 [hoursPerDay:: 6] [people:: Alice 60%]"
    );
  });

  it("replaces existing fields rather than duplicating them", () => {
    const line = writeFinanceToTaskLine(
      "- [ ] Task [hours:: 8] [people:: Alice 100%]",
      {
        hoursPerDay: null,
        totalHours: 16,
        allocations: [{ person: "Bob", share: 1 }],
        expenses: [],
      }
    );

    expect(line).toBe("- [ ] Task [hours:: 16] [people:: Bob 100%]");
  });

  it("replaces a field written under an alias", () => {
    const line = writeFinanceToTaskLine("- [ ] Task [estimatedHours:: 8]", {
      hoursPerDay: null,
      totalHours: 16,
      allocations: [],
      expenses: [],
    });

    expect(line).toBe("- [ ] Task [hours:: 16]");
  });

  it("clears every field when given empty finance", () => {
    const line = writeFinanceToTaskLine(
      "- [ ] Task [hours:: 8] [people:: Alice 100%] [costs:: Bolts 20] 📅 2026-03-06",
      { hoursPerDay: null, totalHours: null, allocations: [], expenses: [] }
    );

    expect(line).toBe("- [ ] Task 📅 2026-03-06");
  });

  it("leaves dates, tags, id and dependencies alone", () => {
    const line = writeFinanceToTaskLine(
      "- [ ] Task #work 🛫 2026-03-02 📅 2026-03-06 ⛔ zzz999 🆔 a1b2c3",
      {
        hoursPerDay: null,
        totalHours: 4,
        allocations: [],
        expenses: [],
      }
    );

    expect(line).toBe(
      "- [ ] Task #work 🛫 2026-03-02 📅 2026-03-06 ⛔ zzz999 🆔 a1b2c3 [hours:: 4]"
    );
  });
});

describe("FINANCE_FIELD_REMOVAL", () => {
  it("strips every finance field from a summary", () => {
    const summary =
      "Fit the loom [hoursPerDay:: 6] [people:: Alice 60%] [costs:: Loom kit 240]"
        .replace(FINANCE_FIELD_REMOVAL, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    expect(summary).toBe("Fit the loom");
  });

  it("leaves a non-finance Dataview field alone", () => {
    const text = "Task [due:: 2026-03-06]";

    expect(text.replace(FINANCE_FIELD_REMOVAL, "")).toBe(text);
  });
});

describe("getFrontmatterFinance", () => {
  it("reads the list form", () => {
    const finance = getFrontmatterFinance({
      hoursPerDay: 6,
      people: [
        { person: "Alice Smith", share: 60 },
        { person: "Bob Jones", share: 40 },
      ],
      costs: [{ description: "Loom kit", amount: 240 }],
    });

    expect(finance.hoursPerDay).toBe(6);
    expect(finance.allocations).toEqual([
      { person: "Alice Smith", share: 0.6 },
      { person: "Bob Jones", share: 0.4 },
    ]);
    expect(finance.expenses).toEqual([
      { description: "Loom kit", amount: 240 },
    ]);
  });

  it("reads the compact string form", () => {
    const finance = getFrontmatterFinance({
      hours: 12,
      people: "Alice 60%, Bob 40%",
      costs: "Loom kit 240",
    });

    expect(finance.totalHours).toBe(12);
    expect(finance.allocations).toEqual([
      { person: "Alice", share: 0.6 },
      { person: "Bob", share: 0.4 },
    ]);
    expect(finance.expenses).toEqual([
      { description: "Loom kit", amount: 240 },
    ]);
  });

  it("reads bare string list entries", () => {
    expect(
      getFrontmatterFinance({ people: ["Alice 60%", "Bob 40%"] }).allocations
    ).toEqual([
      { person: "Alice", share: 0.6 },
      { person: "Bob", share: 0.4 },
    ]);
  });

  it("reads a fractional share written as a fraction", () => {
    expect(
      getFrontmatterFinance({ people: [{ person: "Alice", share: 0.6 }] })
        .allocations
    ).toEqual([{ person: "Alice", share: 0.6 }]);
  });

  it("defaults a person with no share to the whole task", () => {
    expect(
      getFrontmatterFinance({ people: [{ person: "Alice" }] }).allocations
    ).toEqual([{ person: "Alice", share: 1 }]);
  });

  it("keeps an explicit zero", () => {
    expect(getFrontmatterFinance({ hoursPerDay: 0 }).hoursPerDay).toBe(0);
  });

  it("drops an expense with no amount", () => {
    expect(
      getFrontmatterFinance({ costs: [{ description: "Mystery" }] }).expenses
    ).toEqual([]);
  });

  it("reads nothing out of unrelated frontmatter", () => {
    expect(hasFinanceData(getFrontmatterFinance({ status: "open" }))).toBe(
      false
    );
  });
});

describe("financeFrontmatterPatch", () => {
  it("writes shares as percentages", () => {
    const { set } = financeFrontmatterPatch({
      hoursPerDay: 6,
      totalHours: null,
      allocations: [{ person: "Alice", share: 0.6 }],
      expenses: [{ description: "Loom kit", amount: 240 }],
    });

    expect(set).toEqual({
      hoursPerDay: 6,
      people: [{ person: "Alice", share: 60 }],
      costs: [{ description: "Loom kit", amount: 240 }],
    });
  });

  it("removes every alias of a field it is not writing", () => {
    const { set, remove } = financeFrontmatterPatch({
      hoursPerDay: null,
      totalHours: 12,
      allocations: [],
      expenses: [],
    });

    expect(set).toEqual({ hours: 12 });
    expect(remove).toEqual(
      expect.arrayContaining([
        "totalHours",
        "estimatedHours",
        "hoursPerDay",
        "people",
        "costs",
      ])
    );
    expect(remove).not.toContain("hours");
  });
});
