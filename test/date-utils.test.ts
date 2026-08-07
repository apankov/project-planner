import {
  addDays,
  addWorkingDays,
  nextWorkingDay,
  previousWorkingDay,
  workingDayCount,
  diffDays,
  dayOfWeek,
  fromEpochDay,
  inclusiveDayCount,
  isFirstOfMonth,
  isWeekend,
  startOfMonth,
  startOfWeek,
  toEpochDay,
} from "../src/lib/date-utils";

describe("toEpochDay", () => {
  it("round-trips through fromEpochDay", () => {
    const iso = "2026-08-06";
    expect(fromEpochDay(toEpochDay(iso)!)).toBe(iso);
  });

  it("counts a single day between consecutive dates", () => {
    expect(toEpochDay("2026-08-07")! - toEpochDay("2026-08-06")!).toBe(1);
  });

  it.each([
    ["", null],
    ["not-a-date", null],
    ["2026-8-6", null],
    ["2026-02-31", null],
    ["2026-13-01", null],
  ])("rejects %s", (input, expected) => {
    expect(toEpochDay(input)).toBe(expected);
  });

  it("accepts a leap day in a leap year", () => {
    expect(toEpochDay("2028-02-29")).not.toBeNull();
  });

  it("rejects a leap day outside a leap year", () => {
    expect(toEpochDay("2027-02-29")).toBeNull();
  });

  it("treats null and undefined as missing", () => {
    expect(toEpochDay(null)).toBeNull();
    expect(toEpochDay(undefined)).toBeNull();
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("crosses a year boundary backwards", () => {
    expect(addDays("2027-01-02", -3)).toBe("2026-12-30");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(addDays("nope", 5)).toBe("nope");
  });
});

describe("diffDays", () => {
  it("is positive when the second date is later", () => {
    expect(diffDays("2026-08-06", "2026-08-09")).toBe(3);
  });

  it("is negative when the second date is earlier", () => {
    expect(diffDays("2026-08-09", "2026-08-06")).toBe(-3);
  });

  it("is zero for the same day", () => {
    expect(diffDays("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("spans a DST changeover without drifting", () => {
    // The UK clocks change on 2026-03-29
    expect(diffDays("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("inclusiveDayCount", () => {
  it("counts a single day as one", () => {
    expect(inclusiveDayCount("2026-08-06", "2026-08-06")).toBe(1);
  });

  it("includes both endpoints", () => {
    expect(inclusiveDayCount("2026-08-06", "2026-08-08")).toBe(3);
  });

  it("never returns less than one day", () => {
    expect(inclusiveDayCount("2026-08-08", "2026-08-06")).toBe(1);
  });
});

describe("calendar helpers", () => {
  it("identifies weekends", () => {
    // 2026-08-08 is a Saturday, 2026-08-09 a Sunday
    expect(isWeekend("2026-08-08")).toBe(true);
    expect(isWeekend("2026-08-09")).toBe(true);
    expect(isWeekend("2026-08-10")).toBe(false);
  });

  it("reports the day of the week", () => {
    expect(dayOfWeek("2026-08-10")).toBe(1); // Monday
  });

  it("walks back to Monday", () => {
    expect(startOfWeek("2026-08-06")).toBe("2026-08-03");
    expect(startOfWeek("2026-08-03")).toBe("2026-08-03");
    expect(startOfWeek("2026-08-09")).toBe("2026-08-03"); // Sunday
  });

  it("finds the first of the month", () => {
    expect(startOfMonth("2026-08-27")).toBe("2026-08-01");
    expect(isFirstOfMonth("2026-08-01")).toBe(true);
    expect(isFirstOfMonth("2026-08-02")).toBe(false);
  });
});

describe("working days", () => {
  // 2026-08-07 is a Friday; 08-08/09 the weekend; 08-10 the Monday
  it("counts four working days from a Friday to the next Wednesday", () => {
    expect(addWorkingDays("2026-08-07", 3)).toBe("2026-08-12");
  });

  it("skips the weekend when stepping one day from a Friday", () => {
    expect(addWorkingDays("2026-08-07", 1)).toBe("2026-08-10");
  });

  it("steps backwards over a weekend", () => {
    expect(addWorkingDays("2026-08-10", -1)).toBe("2026-08-07");
  });

  it("is a no-op for zero days", () => {
    expect(addWorkingDays("2026-08-08", 0)).toBe("2026-08-08");
  });

  it("moves a weekend date forward to the Monday", () => {
    expect(nextWorkingDay("2026-08-08")).toBe("2026-08-10");
    expect(nextWorkingDay("2026-08-09")).toBe("2026-08-10");
  });

  it("leaves a weekday where it is", () => {
    expect(nextWorkingDay("2026-08-07")).toBe("2026-08-07");
  });

  it("moves a weekend date back to the Friday", () => {
    expect(previousWorkingDay("2026-08-09")).toBe("2026-08-07");
  });

  it("counts working days inclusively, ignoring the weekend", () => {
    expect(workingDayCount("2026-08-07", "2026-08-12")).toBe(4);
    expect(workingDayCount("2026-08-10", "2026-08-14")).toBe(5);
  });

  it("counts a single weekday as one", () => {
    expect(workingDayCount("2026-08-07", "2026-08-07")).toBe(1);
  });

  it("never reports less than one working day", () => {
    expect(workingDayCount("2026-08-08", "2026-08-09")).toBe(1);
  });
});
