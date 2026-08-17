import {
  HandoverLabels,
  buildHandoverHtml,
} from "../src/lib/handover/handover-html";
import {
  HandoverPack,
  HandoverTaskRow,
  noteAnchor,
} from "../src/lib/handover/handover-model";

/**
 * Labels whose values are their own names. Every assertion below is about
 * structure, so readable placeholders beat a copy of the English locale that
 * would have to be kept in step with it.
 */
function labels(): HandoverLabels {
  const section = {
    overview: "Overview",
    plan: "The plan",
    register: "Task register",
    dependencies: "Dependencies",
    finance: "Costs",
    questions: "Open questions",
    notes: "Notes",
  };

  return {
    contents: "Contents",
    generatedOn: "Prepared",
    vault: "Vault",
    preparedWith: "Produced by",
    section,
    overview: {
      tasks: "Tasks",
      span: "Span",
      critical: "On the critical path",
      inferred: "Some dates are estimates",
      overdue: "Overdue",
      unowned: "Nobody named",
      milestones: "Milestones",
      openQuestions: "Open questions",
      answeredQuestions: "Answered questions",
      notes: "Notes",
      statusHeading: "Where the work stands",
      inferredWarning: "{{n}} tasks carry no dates of their own.",
      howToRead: "How to read this pack",
      howToReadBody: "Every task has an ID.",
    },
    register: {
      id: "ID",
      task: "Task",
      status: "Status",
      owner: "Owner",
      start: "Start",
      finish: "Finish",
      progress: "Done",
      dependsOn: "Waits for",
      blocks: "Blocks",
      float: "Float",
      hours: "Hours",
      cost: "Cost",
      note: "Note",
      empty: "This vault has no tasks.",
      suggested: "suggested dates",
      overdue: "already overdue",
      criticalMark: "On the critical path",
      days: "days of slack",
    },
    dependencies: {
      chain: "Chain",
      chainOf: "Chain {{n}} — {{count}} tasks.",
      isolated: "Tasks with no dependencies",
      isolatedDesc: "These block nothing.",
      legendCritical: "Red: on the critical path",
      legendLoop: "Dashed: closes a loop",
      empty: "No task depends on another.",
    },
    milestones: {
      heading: "Milestones",
      date: "Date",
      name: "Milestone",
      past: "passed",
    },
    finance: {
      total: "Total",
      labour: "Labour",
      materials: "Materials",
      hours: "Hours",
      byPerson: "By person",
      byProject: "By project",
      topCosts: "Biggest costs",
      issues: "Costing problems",
      person: "Person",
      project: "Project",
      taskCount: "Tasks",
      priced: "Priced",
      unpriced: "Not priced",
      noFinance: "No cost data",
      inferredNote: "{{amount}} of this total sits on {{n}} tasks.",
      unassigned: "Unassigned",
      empty: "Nothing has been costed.",
    },
    questions: {
      open: "Still open",
      answered: "Answered",
      answeredOn: "answered",
      noAnswer: "No answer recorded yet.",
      raisedIn: "Raised in",
      empty: "No open questions.",
    },
    notes: {
      rootFolder: "Vault root",
      empty: "No notes were included.",
      emptyNote: "This note is empty.",
    },
    statuses: {
      todo: "To do",
      in_progress: "In progress",
      done: "Done",
      canceled: "Cancelled",
    },
    none: "None",
  };
}

function makeTaskRow(
  overrides: Partial<HandoverTaskRow> = {}
): HandoverTaskRow {
  return {
    id: "abc123",
    summary: "Test task",
    status: "todo",
    priority: "",
    owner: null,
    start: "2026-08-10",
    end: "2026-08-14",
    inferred: false,
    percent: null,
    dependsOn: [],
    blocks: [],
    critical: false,
    floatDays: null,
    tags: [],
    projects: [],
    notePath: "tasks/test.md",
    depth: 0,
    hours: null,
    cost: null,
    overdue: false,
    ...overrides,
  };
}

function makePack(overrides: Partial<HandoverPack> = {}): HandoverPack {
  return {
    title: "Kohtari handover",
    vaultName: "Kohtari",
    generatedOn: "2026-08-17",
    summary: {
      taskCount: 1,
      statusCounts: [{ status: "todo", count: 1 }],
      start: "2026-08-10",
      finish: "2026-08-14",
      criticalCount: 0,
      inferredCount: 0,
      overdueCount: 0,
      unownedCount: 1,
      milestoneCount: 0,
      openQuestionCount: 0,
      answeredQuestionCount: 0,
      noteCount: 0,
    },
    ganttSvg: null,
    graphs: [],
    isolatedTaskIds: [],
    tasks: [makeTaskRow()],
    milestones: [],
    finance: null,
    questions: [],
    notes: [],
    ...overrides,
  };
}

function render(pack: HandoverPack): string {
  return buildHandoverHtml({
    pack,
    labels: labels(),
    formatMoney: (value) => `£${value}`,
    formatDate: (iso) => iso,
    producer: "Project Planner 1.0.0",
  });
}

describe("buildHandoverHtml", () => {
  it("produces a complete, self-contained document", () => {
    const html = render(makePack());

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    // Nothing may be *fetched* from outside the file: the recipient may well
    // be offline. Links in a note's prose are another matter and are welcome
    expect(html).not.toContain("<link ");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("@import");
  });

  it("names the pack in the title and on the cover", () => {
    const html = render(makePack({ title: "Kohtari handover" }));

    expect(html).toContain("<title>Kohtari handover</title>");
    expect(html).toContain("<h1>Kohtari handover</h1>");
  });

  it("states the vault, the date and what produced it", () => {
    const html = render(makePack());

    expect(html).toContain("Kohtari");
    expect(html).toContain("2026-08-17");
    expect(html).toContain("Project Planner 1.0.0");
  });

  describe("sections", () => {
    it("leaves out sections with nothing in them", () => {
      const html = render(makePack());

      expect(html).not.toContain('id="finance"');
      expect(html).not.toContain('id="questions"');
      expect(html).not.toContain('id="notes"');
      expect(html).not.toContain('id="dependencies"');
    });

    it("always has an overview and a register", () => {
      const html = render(makePack());

      expect(html).toContain('id="overview"');
      expect(html).toContain('id="register"');
    });

    it("adds the plan once there is a chart", () => {
      const html = render(makePack({ ganttSvg: "<svg><rect /></svg>" }));

      expect(html).toContain('id="plan"');
      expect(html).toContain("<svg><rect /></svg>");
    });

    it("lists only the sections it wrote in the contents", () => {
      const contents = render(makePack()).split('id="overview"')[0];

      expect(contents).toContain('href="#register"');
      expect(contents).not.toContain('href="#finance"');
    });

    it("prints wide sections landscape", () => {
      const html = render(makePack({ ganttSvg: "<svg></svg>" }));

      expect(html).toContain("@page wide");
      expect(html).toContain('class="hp-section hp-wide" id="register"');
      expect(html).toContain('class="hp-section hp-wide" id="plan"');
    });
  });

  describe("the register", () => {
    it("lists a task's dependencies both ways round", () => {
      const html = render(
        makePack({
          tasks: [
            makeTaskRow({ id: "a", blocks: ["b"] }),
            makeTaskRow({ id: "b", dependsOn: ["a"] }),
          ],
        })
      );

      expect(html).toContain("Waits for");
      expect(html).toContain("Blocks");
    });

    it("says so when a task's dates were guessed", () => {
      const html = render(
        makePack({ tasks: [makeTaskRow({ inferred: true })] })
      );

      expect(html).toContain("suggested dates");
    });

    it("marks an overdue finish date", () => {
      const html = render(
        makePack({ tasks: [makeTaskRow({ overdue: true })] })
      );

      expect(html).toContain("hp-overdue");
    });

    it("adds cost columns only when there is a finance section", () => {
      const without = render(makePack());
      expect(without).not.toContain(">Cost<");

      const withFinance = render(
        makePack({
          finance: {
            currency: "GBP",
            total: 100,
            labour: 80,
            materials: 20,
            hours: 4,
            pricedTasks: 1,
            unpricedTasks: 0,
            tasksWithoutFinance: 0,
            inferredTotal: 0,
            inferredTaskCount: 0,
            includeInferred: true,
            byPerson: [],
            byProject: [],
            drivers: [],
            issues: [],
          },
        })
      );
      expect(withFinance).toContain(">Cost<");
    });

    it("says the register is empty rather than printing a bare table", () => {
      const html = render(
        makePack({
          tasks: [],
          summary: { ...makePack().summary, taskCount: 0, statusCounts: [] },
        })
      );

      expect(html).toContain("This vault has no tasks.");
    });
  });

  describe("open questions", () => {
    const question = {
      question: "Is the rollout date fixed?",
      answer: null,
      resolved: false,
      resolvedOn: null,
      noteName: "Rollout",
      notePath: "Rollout.md",
      noteAnchor: null,
    };

    it("puts unanswered questions before settled ones", () => {
      const html = render(
        makePack({
          questions: [
            { ...question, question: "Settled", resolved: true, answer: "Yes" },
            { ...question, question: "Unsettled" },
          ],
        })
      );

      expect(html.indexOf("Unsettled")).toBeLessThan(html.indexOf("Settled"));
    });

    it("links back to the note that raised it when it is in the pack", () => {
      const anchor = noteAnchor("Rollout.md");
      const html = render(
        makePack({
          questions: [{ ...question, noteAnchor: anchor }],
          notes: [
            {
              path: "Rollout.md",
              title: "Rollout",
              folder: "",
              html: "<p>Body</p>",
              anchor,
            },
          ],
        })
      );

      expect(html).toContain(`href="#${anchor}"`);
      expect(html).toContain(`id="${anchor}"`);
    });

    it("does not offer a link to a note that was not exported", () => {
      const html = render(makePack({ questions: [question] }));

      expect(html).toContain("Raised in");
      expect(html).not.toContain('href="#note-');
    });

    it("says when nothing has been answered yet", () => {
      const html = render(makePack({ questions: [question] }));

      expect(html).toContain("No answer recorded yet.");
    });
  });

  describe("the notes appendix", () => {
    const note = {
      path: "Projects/Plan.md",
      title: "Plan",
      folder: "Projects",
      html: "<p>The prose.</p>",
      anchor: noteAnchor("Projects/Plan.md"),
    };

    it("carries the rendered note through untouched", () => {
      const html = render(makePack({ notes: [note] }));

      expect(html).toContain("<p>The prose.</p>");
    });

    it("gives each note a heading the PDF outline can use", () => {
      const html = render(makePack({ notes: [note] }));

      expect(html).toContain(`<h2 id="${note.anchor}">Plan</h2>`);
    });

    it("heads each folder as it changes", () => {
      const html = render(
        makePack({
          notes: [
            note,
            { ...note, path: "Other/A.md", title: "A", folder: "Other" },
          ],
        })
      );

      expect(html).toContain("<h2>Projects</h2>");
      expect(html).toContain("<h2>Other</h2>");
    });

    it("names the root folder rather than heading it blank", () => {
      const html = render(
        makePack({ notes: [{ ...note, folder: "", path: "P.md" }] })
      );

      expect(html).toContain("Vault root");
    });

    it("says so when a note has no content", () => {
      const html = render(makePack({ notes: [{ ...note, html: "  " }] }));

      expect(html).toContain("This note is empty.");
    });
  });

  describe("escaping", () => {
    it("escapes a task name that looks like markup", () => {
      const html = render(
        makePack({
          tasks: [makeTaskRow({ summary: "<script>alert(1)</script>" })],
        })
      );

      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes the pack title", () => {
      const html = render(makePack({ title: 'Q"3 <plan>' }));

      expect(html).toContain("<title>Q&quot;3 &lt;plan&gt;</title>");
    });

    it("escapes a question's text", () => {
      const html = render(
        makePack({
          questions: [
            {
              question: "Is a < b?",
              answer: null,
              resolved: false,
              resolvedOn: null,
              noteName: "n",
              notePath: "n.md",
              noteAnchor: null,
            },
          ],
        })
      );

      expect(html).toContain("Is a &lt; b?");
    });
  });

  describe("caveats", () => {
    it("warns on the overview when dates were guessed", () => {
      const html = render(
        makePack({
          summary: { ...makePack().summary, inferredCount: 4 },
        })
      );

      expect(html).toContain("4 tasks carry no dates of their own.");
    });

    it("says nothing about guessed dates when there are none", () => {
      expect(render(makePack())).not.toContain("carry no dates of their own");
    });

    it("qualifies a total resting on guessed dates", () => {
      const html = render(
        makePack({
          finance: {
            currency: "GBP",
            total: 1000,
            labour: 800,
            materials: 200,
            hours: 10,
            pricedTasks: 2,
            unpricedTasks: 0,
            tasksWithoutFinance: 0,
            inferredTotal: 250,
            inferredTaskCount: 3,
            includeInferred: true,
            byPerson: [],
            byProject: [],
            drivers: [],
            issues: [],
          },
        })
      );

      expect(html).toContain("£250 of this total sits on 3 tasks.");
    });
  });

  describe("dependencies", () => {
    it("captions each chain with how many tasks it holds", () => {
      const html = render(
        makePack({ graphs: [{ svg: "<svg></svg>", nodeCount: 5 }] })
      );

      expect(html).toContain("Chain 1 — 5 tasks.");
    });

    it("names tasks that are in no chain", () => {
      const html = render(
        makePack({
          isolatedTaskIds: ["abc123"],
          tasks: [makeTaskRow({ id: "abc123", summary: "Standalone" })],
        })
      );

      expect(html).toContain("Tasks with no dependencies");
      expect(html).toContain("Standalone");
    });
  });
});
