import { readFileSync } from "fs";
import { join } from "path";
import { parseRateBook } from "../src/lib/rate-book";
import { buildGanttRows } from "../src/lib/gantt-rows";
import { buildCostReport, ReportOptions } from "../src/lib/finance-summary";
import { TaskFactory } from "../src/lib/task-factory";
import { BaseTask } from "../src/types/base-task";

/**
 * The fixture vault is what the finance feature is checked against by hand, so
 * the numbers quoted in it need to be the numbers the code actually produces.
 * This pins them: change the fixture and this test says what it now comes to.
 */

const FIXTURE = join(__dirname, "fixture");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE, name), "utf8");
}

/** The checkbox lines out of the fixture note, parsed as tasks would be. */
function fixtureTasks(): BaseTask[] {
  const factory = new TaskFactory();

  return readFixture("Finance tasks.md")
    .split(/\r?\n/)
    .filter((line) => /^- \[[ x/-]\]/.test(line))
    .map((line) =>
      factory.parse({
        status: " ",
        text: line.replace(/^- \[[ x/-]\]\s*/, ""),
        link: { path: "Finance tasks.md" },
      })
    );
}

const OPTIONS: ReportOptions = {
  defaultHoursPerDay: 8,
  skipWeekends: false,
  includeInferred: true,
};

describe("the finance fixture", () => {
  const book = parseRateBook(readFixture("Finance/People and rates.md"));
  const tasks = fixtureTasks();
  const rows = buildGanttRows(tasks, { skipWeekends: false });
  const report = buildCostReport(rows, book, OPTIONS);

  it("has a readable rates note", () => {
    expect(book.grades.map((g) => g.name)).toEqual([
      "Principal",
      "Senior",
      "Engineer",
      "Apprentice",
    ]);
    expect(book.people.map((p) => p.name)).toEqual([
      "Alice Smith",
      "Bob Jones",
      "Cara Diaz",
      "Dan Fox",
    ]);
  });

  it("reports the deliberately broken rate rows", () => {
    // "Contractor | ask" cannot be priced, and Dan Fox is on a grade that
    // is not in the rates table
    expect(book.problems.map((p) => p.reason).sort()).toEqual([
      "bad-rate",
      "unknown-grade",
    ]);
  });

  it("parses every task", () => {
    expect(tasks).toHaveLength(9);
    expect(
      tasks.filter((task) => task.finance.allocations.length > 0)
    ).toHaveLength(7);
  });

  it("keeps the finance fields out of the summaries", () => {
    expect(tasks.map((task) => task.summary)).toEqual([
      "Fit the sensor loom",
      "Write the FAT report",
      "Bench test",
      "Calibrate rig",
      "Sign off drawings",
      "Chase the supplier",
      "Tidy the bench",
      "Someday: rewrite the harness",
      "Buy the enclosure",
    ]);
  });

  it("comes to the total the fixture claims", () => {
    expect(report.materials).toBe(240 + 85 + 320 + 12.5);
    expect(report.labour).toBe(14_875);
    expect(report.total).toBe(15_532.5);
  });

  it("surfaces every awkward case as a problem rather than a wrong number", () => {
    const kinds = new Set(report.issues.map((entry) => entry.issue.kind));

    expect(kinds).toContain("unknown-person");
    expect(kinds).toContain("no-rate");
    expect(kinds).toContain("allocations-off");
    expect(kinds).toContain("no-allocations");
  });

  it("puts the undated task's cost on a suggested bar", () => {
    const undated = report.costs.get(
      tasks.find((task) => task.summary.startsWith("Someday"))!.id
    );

    expect(undated?.inferred).toBe(true);
    expect(report.inferredTotal).toBe(40 * 145);
  });
});
