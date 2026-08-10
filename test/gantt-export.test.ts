import {
  DEFAULT_EXPORT_OPTIONS,
  GanttExportInput,
  GanttExportLabels,
  GanttExportLine,
  GanttExportOptions,
  GanttExportTask,
  buildGanttSvg,
  exportFileName,
  formatExportDate,
} from "../src/lib/gantt-export";

const LABELS: GanttExportLabels = {
  today: "Today",
  statuses: {
    todo: "To do",
    in_progress: "In progress",
    done: "Done",
    canceled: "Cancelled",
  },
  suggested: "Suggested dates",
  summary: "Summary",
  milestone: "Milestone",
  critical: "Critical path",
};

function makeTask(overrides: Partial<GanttExportTask> = {}): GanttExportTask {
  return {
    kind: "task",
    id: "t1",
    label: "Write the spec",
    depth: 0,
    start: "2026-06-01",
    end: "2026-06-10",
    status: "todo",
    percent: null,
    inferred: false,
    rollup: false,
    critical: false,
    ...overrides,
  };
}

function makeInput(
  lines: GanttExportLine[],
  overrides: Partial<GanttExportInput> = {}
): GanttExportInput {
  const options: GanttExportOptions = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...overrides.options,
  };

  return {
    title: "Project plan",
    subtitle: "3 tasks",
    footer: "Vault · Tasks Map",
    lines,
    laneMilestones: [],
    dependencies: [],
    timelineStart: "2026-06-01",
    timelineEnd: "2026-06-30",
    today: "2026-06-05",
    labels: LABELS,
    ...overrides,
    options,
  };
}

describe("buildGanttSvg", () => {
  it("draws a self-contained SVG document sized to the page", () => {
    const { svg, width, height } = buildGanttSvg(makeInput([makeTask()]));

    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    // A4 landscape laid out at 96dpi
    expect(width).toBe(1123);
    expect(height).toBeGreaterThan(0);
  });

  it("puts the title, subtitle and footer on the page", () => {
    const { svg } = buildGanttSvg(makeInput([makeTask()]));

    expect(svg).toContain(">Project plan<");
    expect(svg).toContain(">3 tasks<");
    expect(svg).toContain(">Vault · Tasks Map<");
  });

  it.each([
    ["a4", 1123],
    ["a3", 1587],
    ["slide", 1280],
  ] as const)("lays %s out %s wide", (paper, expected) => {
    const { width } = buildGanttSvg(
      makeInput([makeTask()], { options: { ...DEFAULT_EXPORT_OPTIONS, paper } })
    );

    expect(width).toBe(expected);
  });

  it("keeps every task's name on the page", () => {
    const { svg } = buildGanttSvg(
      makeInput([
        makeTask({ id: "a", label: "First task" }),
        makeTask({ id: "b", label: "Second task" }),
      ])
    );

    expect(svg).toContain(">First task<");
    expect(svg).toContain(">Second task<");
  });

  it("escapes markup in a task's name", () => {
    const { svg } = buildGanttSvg(
      makeInput([makeTask({ label: 'Fix <b> & "quotes"' })])
    );

    expect(svg).toContain("Fix &lt;b&gt; &amp; &quot;quotes&quot;");
    expect(svg).not.toContain("<b>");
  });

  it("grows taller as rows are added, and never past the row floor", () => {
    const short = buildGanttSvg(makeInput([makeTask()]));
    const long = buildGanttSvg(
      makeInput(
        Array.from({ length: 120 }, (_, index) =>
          makeTask({ id: `t${index}`, label: `Task ${index}` })
        )
      )
    );

    expect(long.height).toBeGreaterThan(short.height);
    // 120 rows cannot fit a page, so they take the smallest row height
    expect(long.height).toBeGreaterThan(120 * 15);
  });

  describe("the today marker", () => {
    it("is drawn when today falls inside the timeline", () => {
      const { svg } = buildGanttSvg(makeInput([makeTask()]));
      expect(svg).toContain(">Today<");
    });

    it("is left off when today is outside it", () => {
      const { svg } = buildGanttSvg(
        makeInput([makeTask()], { today: "2027-01-01" })
      );
      expect(svg).not.toContain(">Today<");
    });
  });

  describe("the legend", () => {
    it("lists only the states the chart actually uses", () => {
      const { svg } = buildGanttSvg(
        makeInput([
          makeTask({ id: "a", status: "todo" }),
          makeTask({ id: "b", status: "done" }),
        ])
      );

      expect(svg).toContain(">To do<");
      expect(svg).toContain(">Done<");
      expect(svg).not.toContain(">In progress<");
      expect(svg).not.toContain(">Cancelled<");
    });

    it("explains suggested dates only when some are suggested", () => {
      const plain = buildGanttSvg(makeInput([makeTask()]));
      const suggested = buildGanttSvg(
        makeInput([makeTask({ inferred: true })])
      );

      expect(plain.svg).not.toContain(">Suggested dates<");
      expect(suggested.svg).toContain(">Suggested dates<");
    });

    it("explains the critical path only when one is marked", () => {
      const plain = buildGanttSvg(makeInput([makeTask()]));
      const critical = buildGanttSvg(makeInput([makeTask({ critical: true })]));

      expect(plain.svg).not.toContain(">Critical path<");
      expect(critical.svg).toContain(">Critical path<");
    });

    it("explains milestones only when there are some", () => {
      const plain = buildGanttSvg(makeInput([makeTask()]));
      const marked = buildGanttSvg(
        makeInput([makeTask()], {
          laneMilestones: [{ label: "Release", date: "2026-06-20" }],
        })
      );

      expect(plain.svg).not.toContain(">Milestone<");
      expect(marked.svg).toContain(">Milestone<");
    });
  });

  describe("milestones", () => {
    it("names a lane milestone beside its mark", () => {
      const { svg } = buildGanttSvg(
        makeInput([makeTask()], {
          laneMilestones: [{ label: "Release 1.0", date: "2026-06-20" }],
        })
      );

      expect(svg).toContain(">Release 1.0<");
      expect(svg).toContain("<polygon");
    });

    it("leaves out a milestone that falls off the timeline", () => {
      const { svg } = buildGanttSvg(
        makeInput([makeTask()], {
          laneMilestones: [{ label: "Much later", date: "2027-06-20" }],
        })
      );

      expect(svg).not.toContain(">Much later<");
    });

    it("draws one filed among the tasks as a line of its own", () => {
      const { svg } = buildGanttSvg(
        makeInput([
          makeTask(),
          { kind: "milestone", label: "Sign-off", date: "2026-06-15" },
        ])
      );

      expect(svg).toContain(">Sign-off<");
    });
  });

  describe("group headings", () => {
    it("draws the heading and the count beside it", () => {
      const { svg } = buildGanttSvg(
        makeInput([{ kind: "heading", label: "Design", count: 4 }, makeTask()])
      );

      expect(svg).toContain(">Design<");
      expect(svg).toContain(">4<");
    });
  });

  describe("dependencies", () => {
    const lines = [
      makeTask({ id: "a", start: "2026-06-01", end: "2026-06-05" }),
      makeTask({ id: "b", start: "2026-06-08", end: "2026-06-12" }),
    ];
    const dependencies = [{ fromId: "a", toId: "b" }];

    it("are left out unless they were asked for", () => {
      const { svg } = buildGanttSvg(makeInput(lines, { dependencies }));
      expect(svg).not.toContain("<path");
    });

    it("are drawn as elbows with an arrowhead when they were", () => {
      const { svg } = buildGanttSvg(
        makeInput(lines, {
          dependencies,
          options: { ...DEFAULT_EXPORT_OPTIONS, showDependencies: true },
        })
      );

      expect(svg).toContain("<path");
      expect(svg).toContain("marker-end=");
    });

    it("drops a link to a task that is not on the chart", () => {
      const { svg } = buildGanttSvg(
        makeInput(lines, {
          dependencies: [{ fromId: "a", toId: "missing" }],
          options: { ...DEFAULT_EXPORT_OPTIONS, showDependencies: true },
        })
      );

      expect(svg).not.toContain("<path");
    });
  });

  describe("edge cases", () => {
    it("survives an empty chart", () => {
      const { svg, height } = buildGanttSvg(makeInput([]));

      expect(svg.startsWith("<svg")).toBe(true);
      expect(height).toBeGreaterThan(0);
    });

    it("survives a one-day timeline", () => {
      const { svg } = buildGanttSvg(
        makeInput([makeTask({ start: "2026-06-01", end: "2026-06-01" })], {
          timelineStart: "2026-06-01",
          timelineEnd: "2026-06-01",
          today: "2026-06-01",
        })
      );

      expect(svg).toContain("<rect");
      expect(svg).not.toContain("NaN");
    });

    it("never emits NaN coordinates for a long plan", () => {
      const { svg } = buildGanttSvg(
        makeInput(
          Array.from({ length: 40 }, (_, index) =>
            makeTask({
              id: `t${index}`,
              start: "2026-01-01",
              end: "2027-12-31",
              percent: 50,
              status: "in_progress",
            })
          ),
          { timelineStart: "2026-01-01", timelineEnd: "2027-12-31" }
        )
      );

      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    });
  });
});

describe("formatExportDate", () => {
  it("writes a readable day", () => {
    expect(formatExportDate("2026-06-03", "en-GB")).toBe("3 Jun 2026");
  });

  it("hands back anything it cannot read", () => {
    expect(formatExportDate("not-a-date")).toBe("not-a-date");
  });
});

describe("exportFileName", () => {
  it("names the file after the chart and the day", () => {
    expect(exportFileName("Project plan", "2026-06-03")).toBe(
      "Project plan 2026-06-03.png"
    );
  });

  it("drops characters a file name cannot hold", () => {
    expect(exportFileName('Q3: plan/v2 "final"', "2026-06-03")).toBe(
      "Q3 planv2 final 2026-06-03.png"
    );
  });

  it("falls back to a name when there is nothing left", () => {
    expect(exportFileName("***", "2026-06-03")).toBe("gantt 2026-06-03.png");
  });
});
