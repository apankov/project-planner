import { PROGRESS_FIELD_REMOVAL } from "../src/lib/task-regex";
import {
  EMPTY_TASK_PROGRESS,
  clampProgress,
  effectiveTaskStatus,
  formatProgress,
  getFrontmatterProgress,
  getTaskProgress,
  hasProgressData,
  parseProgress,
  progressFrontmatterPatch,
  writeProgressToTaskLine,
} from "../src/lib/task-progress";

/** An inline task line carrying whatever metadata a case needs. */
function makeTask(metadata = ""): string {
  return `- [ ] Fit the loom${metadata ? ` ${metadata}` : ""} 🆔 a1b2c3`;
}

describe("getTaskProgress", () => {
  it("reads a plain percentage off a task line", () => {
    expect(getTaskProgress(makeTask("[progress:: 40]"))).toEqual({
      percent: 40,
    });
  });

  it("reads a task with no progress as empty", () => {
    const progress = getTaskProgress(makeTask("📅 2026-03-06"));

    expect(progress).toEqual(EMPTY_TASK_PROGRESS);
    expect(hasProgressData(progress)).toBe(false);
  });

  it.each<[string, number]>([
    ["[progress:: 40]", 40],
    ["[progress:: 40%]", 40],
    ["(progress:: 40)", 40],
    ["(progress:: 40%)", 40],
    ["[[progress:: 40]]", 40],
    ["[PROGRESS:: 40]", 40],
    ["[progress::40]", 40],
    ["[progress::   40   ]", 40],
    ["[percentComplete:: 40]", 40],
    ["[percent-complete:: 40]", 40],
    ["[percentcomplete:: 40]", 40],
    ["[percent:: 40]", 40],
  ])("accepts %s", (field, expected) => {
    expect(getTaskProgress(makeTask(field)).percent).toBe(expected);
  });

  it("keeps an explicit zero rather than reading it as unset", () => {
    const progress = getTaskProgress(makeTask("[progress:: 0]"));

    expect(progress.percent).toBe(0);
    expect(hasProgressData(progress)).toBe(true);
  });

  it("clamps a percentage above the scale", () => {
    expect(getTaskProgress(makeTask("[progress:: 120]")).percent).toBe(100);
  });

  it("clamps a negative percentage to zero", () => {
    expect(getTaskProgress(makeTask("[progress:: -5]")).percent).toBe(0);
  });

  it("rounds a fractional percentage to a whole number", () => {
    expect(getTaskProgress(makeTask("[progress:: 42.6]")).percent).toBe(43);
  });

  it("reads progress alongside finance and dates without confusion", () => {
    const line = makeTask(
      "[hours:: 12] [progress:: 75] [people:: Alice 60%] 📅 2026-03-06"
    );

    expect(getTaskProgress(line).percent).toBe(75);
  });

  it("does not read a share out of a finance field", () => {
    expect(
      getTaskProgress(makeTask("[people:: Alice 60%]")).percent
    ).toBeNull();
  });
});

describe("parseProgress", () => {
  it.each<[string, number]>([
    ["40", 40],
    ["40%", 40],
    [" 40 ", 40],
    ["40 %", 40],
    ["0", 0],
    ["100", 100],
    ["+25", 25],
  ])("reads %s as a percentage", (value, expected) => {
    expect(parseProgress(value)).toBe(expected);
  });

  it.each(["", "   ", "abc", "40 percent", "nearly done", "4 0", "%", "40%%"])(
    "reads %s as nothing",
    (value) => {
      expect(parseProgress(value)).toBeNull();
    }
  );

  it("reads a small decimal at face value rather than as a fraction", () => {
    // 0.4 means four tenths of one percent, not 40% — guessing otherwise
    // would silently turn "just started" into "nearly half done"
    expect(parseProgress("0.4")).toBe(0);
  });
});

describe("clampProgress", () => {
  it.each<[number, number]>([
    [40, 40],
    [0, 0],
    [100, 100],
    [101, 100],
    [1000, 100],
    [-1, 0],
    [-1000, 0],
    [42.4, 42],
    [42.5, 43],
  ])("holds %s to the scale", (value, expected) => {
    expect(clampProgress(value)).toBe(expected);
  });

  it.each([null, undefined])("reads %s as unset", (value) => {
    expect(clampProgress(value)).toBeNull();
  });
});

describe("formatProgress", () => {
  it.each<[number, string]>([
    [40, "40"],
    [0, "0"],
    [100, "100"],
    [42.6, "43"],
    [120, "100"],
  ])("writes %s as %s", (value, expected) => {
    expect(formatProgress(value)).toBe(expected);
  });

  it("writes nothing for an unset percentage", () => {
    expect(formatProgress(null)).toBe("");
  });
});

describe("writeProgressToTaskLine", () => {
  it("appends the field to a line that had none", () => {
    expect(
      writeProgressToTaskLine("- [ ] Fit the loom 🆔 a1b2c3", { percent: 40 })
    ).toBe("- [ ] Fit the loom 🆔 a1b2c3 [progress:: 40]");
  });

  it("replaces an existing field rather than duplicating it", () => {
    expect(
      writeProgressToTaskLine("- [ ] Task [progress:: 20]", { percent: 80 })
    ).toBe("- [ ] Task [progress:: 80]");
  });

  it("replaces a field written under an alias", () => {
    expect(
      writeProgressToTaskLine("- [ ] Task [percentComplete:: 20]", {
        percent: 80,
      })
    ).toBe("- [ ] Task [progress:: 80]");
  });

  it("clears the field when given no percentage", () => {
    expect(
      writeProgressToTaskLine("- [ ] Task [progress:: 20] 📅 2026-03-06", {
        percent: null,
      })
    ).toBe("- [ ] Task 📅 2026-03-06");
  });

  it("clamps before writing", () => {
    expect(writeProgressToTaskLine("- [ ] Task", { percent: 140 })).toBe(
      "- [ ] Task [progress:: 100]"
    );
  });

  it("leaves dates, tags, id, finance and dependencies alone", () => {
    expect(
      writeProgressToTaskLine(
        "- [ ] Task #work 🛫 2026-03-02 📅 2026-03-06 [hours:: 12] ⛔ zzz999 🆔 a1b2c3",
        { percent: 50 }
      )
    ).toBe(
      "- [ ] Task #work 🛫 2026-03-02 📅 2026-03-06 [hours:: 12] ⛔ zzz999 🆔 a1b2c3 [progress:: 50]"
    );
  });

  it("survives a round trip", () => {
    const line = writeProgressToTaskLine(makeTask(), { percent: 65 });

    expect(getTaskProgress(line)).toEqual({ percent: 65 });
    expect(writeProgressToTaskLine(line, getTaskProgress(line))).toBe(line);
  });
});

describe("PROGRESS_FIELD_REMOVAL", () => {
  it("strips the progress field from a summary", () => {
    const summary = "Fit the loom [progress:: 40] [percent:: 40%]"
      .replace(PROGRESS_FIELD_REMOVAL, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    expect(summary).toBe("Fit the loom");
  });

  it("leaves an unrelated Dataview field alone", () => {
    const text = "Task [due:: 2026-03-06] [hours:: 12]";

    expect(text.replace(PROGRESS_FIELD_REMOVAL, "")).toBe(text);
  });
});

describe("getFrontmatterProgress", () => {
  it("reads a number", () => {
    expect(getFrontmatterProgress({ progress: 40 })).toEqual({ percent: 40 });
  });

  it.each(["40", "40%", " 40 "])("reads the string form %s", (value) => {
    expect(getFrontmatterProgress({ progress: value }).percent).toBe(40);
  });

  it.each([
    "percentComplete",
    "percent-complete",
    "percentcomplete",
    "percent",
  ])("accepts %s as a key", (key) => {
    expect(getFrontmatterProgress({ [key]: 40 }).percent).toBe(40);
  });

  it("prefers the canonical key when a note carries two", () => {
    expect(getFrontmatterProgress({ percent: 10, progress: 90 }).percent).toBe(
      90
    );
  });

  it("keeps an explicit zero", () => {
    const progress = getFrontmatterProgress({ progress: 0 });

    expect(progress.percent).toBe(0);
    expect(hasProgressData(progress)).toBe(true);
  });

  it("clamps an out-of-range value", () => {
    expect(getFrontmatterProgress({ progress: 250 }).percent).toBe(100);
    expect(getFrontmatterProgress({ progress: -20 }).percent).toBe(0);
  });

  it("reads nothing out of unrelated frontmatter", () => {
    expect(
      hasProgressData(getFrontmatterProgress({ status: "open", hours: 12 }))
    ).toBe(false);
  });
});

describe("progressFrontmatterPatch", () => {
  it("writes the canonical key", () => {
    expect(progressFrontmatterPatch({ percent: 40 }).set).toEqual({
      progress: 40,
    });
  });

  it("clamps what it writes", () => {
    expect(progressFrontmatterPatch({ percent: 140 }).set).toEqual({
      progress: 100,
    });
  });

  it("removes every alias it is not writing", () => {
    const { set, remove } = progressFrontmatterPatch({ percent: 40 });

    expect(set).toEqual({ progress: 40 });
    expect(remove).toEqual(
      expect.arrayContaining([
        "percentComplete",
        "percent-complete",
        "percentcomplete",
        "percent",
      ])
    );
    expect(remove).not.toContain("progress");
  });

  it("removes the canonical key too when clearing", () => {
    const { set, remove } = progressFrontmatterPatch({ percent: null });

    expect(set).toEqual({});
    expect(remove).toContain("progress");
  });
});

describe("edge cases", () => {
  it.each([
    "[progress::]",
    "[progress:: ]",
    "[progress:: none]",
    "[progress:: 40 percent]",
    "[progress:: half]",
    "[progress:: 4o]",
  ])("reads the malformed field %s as unset", (field) => {
    expect(getTaskProgress(makeTask(field)).percent).toBeNull();
  });

  it("ignores a progress word that is not a Dataview field", () => {
    expect(
      getTaskProgress("- [ ] Review the progress report 40%").percent
    ).toBeNull();
  });

  it("reads nothing off an empty string", () => {
    expect(getTaskProgress("")).toEqual({ percent: null });
  });

  it("takes the first field when a line carries two", () => {
    expect(
      getTaskProgress(makeTask("[progress:: 30] [progress:: 70]")).percent
    ).toBe(30);
  });

  it("strips both fields when rewriting a line that carries two", () => {
    expect(
      writeProgressToTaskLine("- [ ] Task [progress:: 30] [percent:: 70]", {
        percent: 50,
      })
    ).toBe("- [ ] Task [progress:: 50]");
  });

  it("does not leave a trailing space when clearing the only field", () => {
    expect(
      writeProgressToTaskLine("- [ ] Task [progress:: 30]", { percent: null })
    ).toBe("- [ ] Task");
  });

  it("survives a NaN or an infinity", () => {
    expect(clampProgress(Number.NaN)).toBeNull();
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampProgress(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("ignores a frontmatter value of the wrong shape", () => {
    expect(getFrontmatterProgress({ progress: true }).percent).toBeNull();
    expect(getFrontmatterProgress({ progress: [40] }).percent).toBeNull();
    expect(getFrontmatterProgress({ progress: {} }).percent).toBeNull();
    expect(getFrontmatterProgress({ progress: null }).percent).toBeNull();
  });

  it("falls through to a usable key when the first one is unreadable", () => {
    expect(
      getFrontmatterProgress({ progress: "unknown", percent: 40 }).percent
    ).toBe(40);
  });

  it("never mutates the shared empty constant", () => {
    getTaskProgress(makeTask("[progress:: 40]"));

    expect(EMPTY_TASK_PROGRESS).toEqual({ percent: null });
  });
});

describe("effectiveTaskStatus", () => {
  it.each([1, 40, 99, 100])(
    "reads a todo task carrying %i%% as in progress",
    (percent) => {
      expect(effectiveTaskStatus("todo", { percent })).toBe("in_progress");
    }
  );

  it("leaves a todo task with no progress alone", () => {
    expect(effectiveTaskStatus("todo", EMPTY_TASK_PROGRESS)).toBe("todo");
  });

  it("treats zero as not started rather than as underway", () => {
    expect(effectiveTaskStatus("todo", { percent: 0 })).toBe("todo");
  });

  it.each(["done", "canceled"] as const)(
    "does not drag a %s task back to in progress",
    (status) => {
      expect(effectiveTaskStatus(status, { percent: 60 })).toBe(status);
    }
  );

  it("leaves an in-progress task as it is", () => {
    expect(effectiveTaskStatus("in_progress", { percent: 10 })).toBe(
      "in_progress"
    );
  });

  it("does not promote a finished percentage to done", () => {
    expect(effectiveTaskStatus("todo", { percent: 100 })).toBe("in_progress");
  });

  describe("edge cases", () => {
    it("clamps before deciding, so an over-range value still counts", () => {
      expect(effectiveTaskStatus("todo", { percent: 250 })).toBe("in_progress");
    });

    it("treats a negative percentage as not started", () => {
      expect(effectiveTaskStatus("todo", { percent: -20 })).toBe("todo");
    });

    it("ignores a value that is not a number at all", () => {
      expect(effectiveTaskStatus("todo", { percent: Number.NaN })).toBe("todo");
    });
  });
});
