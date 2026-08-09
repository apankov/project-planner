import {
  GanttMilestone,
  MILESTONE_ORDER_PREFIX,
  addMilestone,
  findMilestone,
  isGanttMilestone,
  laneMilestones,
  milestoneIdFromOrderKey,
  milestoneOrderKey,
  milestoneStatus,
  readMilestoneDisplay,
  readMilestones,
  removeMilestone,
  rowMilestones,
  shiftMilestone,
  sortMilestones,
  updateMilestone,
} from "../src/lib/gantt-milestones";

const TODAY = "2026-08-06";

function makeMilestone(
  id: string,
  overrides: Partial<GanttMilestone> = {}
): GanttMilestone {
  return {
    id,
    label: `Milestone ${id}`,
    date: TODAY,
    display: "lane",
    ...overrides,
  };
}

describe("isGanttMilestone", () => {
  it("accepts a well-formed milestone", () => {
    expect(isGanttMilestone(makeMilestone("a"))).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "2026-08-06"],
    ["a missing id", { label: "Launch", date: TODAY }],
    ["an empty id", { id: "", label: "Launch", date: TODAY }],
    ["a missing label", { id: "a", date: TODAY }],
    ["a missing date", { id: "a", label: "Launch" }],
    ["an unparseable date", { id: "a", label: "Launch", date: "next friday" }],
    ["a calendar overflow", { id: "a", label: "Launch", date: "2026-02-31" }],
  ])("rejects %s", (_name, value) => {
    expect(isGanttMilestone(value)).toBe(false);
  });

  it("accepts an empty label, which the modal never writes but a data file can", () => {
    expect(isGanttMilestone({ id: "a", label: "", date: TODAY })).toBe(true);
  });

  // `display` arrived after milestones did. A settings file written by an
  // earlier version has no such key, and dropping those milestones would wipe
  // every milestone a user already had.
  it("accepts a milestone with no display at all", () => {
    expect(isGanttMilestone({ id: "a", label: "Launch", date: TODAY })).toBe(
      true
    );
  });

  it.each([
    ["a nonsense display", "sideways"],
    ["a numeric display", 3],
    ["a null display", null],
  ])("accepts %s rather than dropping the milestone", (_name, display) => {
    expect(
      isGanttMilestone({ id: "a", label: "Launch", date: TODAY, display })
    ).toBe(true);
  });
});

describe("readMilestoneDisplay", () => {
  it("reads the one value that means a row", () => {
    expect(readMilestoneDisplay("row")).toBe("row");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["the lane itself", "lane"],
    ["nonsense", "sideways"],
    ["a number", 3],
    ["an object", {}],
  ])("reads %s as the lane", (_name, value) => {
    expect(readMilestoneDisplay(value)).toBe("lane");
  });
});

describe("milestone order keys", () => {
  it("namespaces a milestone's slot in the row order", () => {
    expect(milestoneOrderKey("abc")).toBe(`${MILESTONE_ORDER_PREFIX}abc`);
  });

  it("reads the milestone back out of its key", () => {
    expect(milestoneIdFromOrderKey(milestoneOrderKey("abc"))).toBe("abc");
  });

  it.each([
    ["a task id", "abc123"],
    ["a note path", "Tasks/Ship it.md"],
    ["the bare prefix", MILESTONE_ORDER_PREFIX],
  ])("does not mistake %s for a milestone", (_name, key) => {
    expect(milestoneIdFromOrderKey(key)).toBeNull();
  });
});

describe("laneMilestones and rowMilestones", () => {
  const milestones = [
    makeMilestone("a", { display: "lane" }),
    makeMilestone("b", { display: "row" }),
    makeMilestone("c", { display: "lane" }),
  ];

  it("splits the list by where each one is drawn", () => {
    expect(laneMilestones(milestones).map((m) => m.id)).toEqual(["a", "c"]);
    expect(rowMilestones(milestones).map((m) => m.id)).toEqual(["b"]);
  });

  it("puts everything in the lane when nothing asked for a row", () => {
    const lane = [makeMilestone("a"), makeMilestone("b")];
    expect(laneMilestones(lane)).toHaveLength(2);
    expect(rowMilestones(lane)).toHaveLength(0);
  });
});

describe("sortMilestones", () => {
  it("puts the earliest milestone first", () => {
    const sorted = sortMilestones([
      makeMilestone("b", { date: "2026-09-01" }),
      makeMilestone("a", { date: "2026-08-01" }),
      makeMilestone("c", { date: "2026-10-01" }),
    ]);

    expect(sorted.map((milestone) => milestone.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties on the same day by label", () => {
    const sorted = sortMilestones([
      makeMilestone("b", { label: "Ship" }),
      makeMilestone("a", { label: "Freeze" }),
    ]);

    expect(sorted.map((milestone) => milestone.label)).toEqual([
      "Freeze",
      "Ship",
    ]);
  });

  it("leaves the input alone", () => {
    const milestones = [
      makeMilestone("b", { date: "2026-09-01" }),
      makeMilestone("a", { date: "2026-08-01" }),
    ];
    sortMilestones(milestones);

    expect(milestones.map((milestone) => milestone.id)).toEqual(["b", "a"]);
  });
});

describe("readMilestones", () => {
  it("returns nothing for a missing setting", () => {
    expect(readMilestones(undefined)).toEqual([]);
    expect(readMilestones(null)).toEqual([]);
    expect(readMilestones("[]")).toEqual([]);
  });

  it("drops malformed entries rather than the whole list", () => {
    const milestones = readMilestones([
      makeMilestone("a", { date: "2026-08-10" }),
      { id: "b", label: "Broken", date: "whenever" },
      makeMilestone("c", { date: "2026-08-20" }),
    ]);

    expect(milestones.map((milestone) => milestone.id)).toEqual(["a", "c"]);
  });

  it("keeps the first of two entries sharing an id", () => {
    const milestones = readMilestones([
      makeMilestone("a", { label: "First" }),
      makeMilestone("a", { label: "Second" }),
    ]);

    expect(milestones).toHaveLength(1);
    expect(milestones[0].label).toBe("First");
  });

  it("returns them in date order", () => {
    const milestones = readMilestones([
      makeMilestone("b", { date: "2026-09-01" }),
      makeMilestone("a", { date: "2026-08-01" }),
    ]);

    expect(milestones.map((milestone) => milestone.id)).toEqual(["a", "b"]);
  });

  // The whole point of the back-compat guard: a data file written before row
  // milestones existed still draws exactly as it always did
  it("reads a milestone saved without a display as a lane flag", () => {
    const milestones = readMilestones([
      { id: "a", label: "Launch", date: TODAY },
    ]);

    expect(milestones).toEqual([
      { id: "a", label: "Launch", date: TODAY, display: "lane" },
    ]);
  });

  it("keeps a milestone whose display is nonsense, as a lane flag", () => {
    const milestones = readMilestones([
      { id: "a", label: "Launch", date: TODAY, display: "sideways" },
    ]);

    expect(milestones).toHaveLength(1);
    expect(milestones[0].display).toBe("lane");
  });

  it("keeps a row milestone a row", () => {
    const milestones = readMilestones([
      { id: "a", label: "Launch", date: TODAY, display: "row" },
    ]);

    expect(milestones[0].display).toBe("row");
  });
});

describe("addMilestone", () => {
  it("inserts by date rather than at the end", () => {
    const milestones = addMilestone(
      [
        makeMilestone("a", { date: "2026-08-01" }),
        makeMilestone("c", { date: "2026-10-01" }),
      ],
      makeMilestone("b", { date: "2026-09-01" })
    );

    expect(milestones.map((milestone) => milestone.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("replaces an existing milestone with the same id", () => {
    const milestones = addMilestone(
      [makeMilestone("a", { label: "Old" })],
      makeMilestone("a", { label: "New" })
    );

    expect(milestones).toHaveLength(1);
    expect(milestones[0].label).toBe("New");
  });
});

describe("updateMilestone", () => {
  it("applies the changes and re-sorts", () => {
    const milestones = updateMilestone(
      [
        makeMilestone("a", { date: "2026-08-01" }),
        makeMilestone("b", { date: "2026-09-01" }),
      ],
      "a",
      { date: "2026-10-01", label: "Moved" }
    );

    expect(milestones.map((milestone) => milestone.id)).toEqual(["b", "a"]);
    expect(findMilestone(milestones, "a")).toMatchObject({
      date: "2026-10-01",
      label: "Moved",
    });
  });

  it("ignores an unknown id", () => {
    const milestones = updateMilestone([makeMilestone("a")], "nope", {
      label: "New",
    });

    expect(milestones).toEqual([makeMilestone("a")]);
  });

  // Moving a milestone between the lane and the list must not mean deleting it
  // and typing it out again
  it("moves a milestone from the lane into the list", () => {
    const milestones = updateMilestone([makeMilestone("a")], "a", {
      display: "row",
    });

    expect(findMilestone(milestones, "a")).toMatchObject({
      display: "row",
      label: "Milestone a",
      date: TODAY,
    });
  });

  it("moves one back out of the list into the lane", () => {
    const milestones = updateMilestone(
      [makeMilestone("a", { display: "row" })],
      "a",
      { display: "lane" }
    );

    expect(findMilestone(milestones, "a")?.display).toBe("lane");
  });

  it("leaves the display alone when the change does not mention it", () => {
    const milestones = updateMilestone(
      [makeMilestone("a", { display: "row" })],
      "a",
      { date: "2026-09-01" }
    );

    expect(findMilestone(milestones, "a")?.display).toBe("row");
  });
});

describe("removeMilestone", () => {
  it("removes only the named milestone", () => {
    const milestones = removeMilestone(
      [makeMilestone("a"), makeMilestone("b")],
      "a"
    );

    expect(milestones.map((milestone) => milestone.id)).toEqual(["b"]);
  });
});

describe("shiftMilestone", () => {
  it("moves a milestone by whole days", () => {
    const milestones = shiftMilestone(
      [makeMilestone("a", { date: "2026-08-06" })],
      "a",
      4
    );

    expect(milestones[0].date).toBe("2026-08-10");
  });

  it("moves backwards across a month boundary", () => {
    const milestones = shiftMilestone(
      [makeMilestone("a", { date: "2026-08-02" })],
      "a",
      -5
    );

    expect(milestones[0].date).toBe("2026-07-28");
  });

  it("leaves the list alone for a zero-day drag", () => {
    const original = [makeMilestone("a")];
    expect(shiftMilestone(original, "a", 0)).toEqual(original);
  });

  it("leaves the list alone for an unknown id", () => {
    const original = [makeMilestone("a")];
    expect(shiftMilestone(original, "nope", 3)).toEqual(original);
  });

  it("re-sorts when a drag jumps a neighbour", () => {
    const milestones = shiftMilestone(
      [
        makeMilestone("a", { date: "2026-08-01" }),
        makeMilestone("b", { date: "2026-08-05" }),
      ],
      "a",
      10
    );

    expect(milestones.map((milestone) => milestone.id)).toEqual(["b", "a"]);
  });
});

describe("milestoneStatus", () => {
  it.each([
    ["2026-08-01", "past"],
    ["2026-08-06", "today"],
    ["2026-08-07", "upcoming"],
  ])("calls %s %s", (date, expected) => {
    expect(milestoneStatus(makeMilestone("a", { date }), TODAY)).toBe(expected);
  });
});
