import { NoteTask } from "../src/types/note-task";
import { TaskDateProperty } from "../src/lib/task-dates";
import { TaskStatus } from "../src/types/task";
import { buildGanttRows } from "../src/lib/gantt-rows";
import { planCascade } from "../src/lib/gantt-cascade";

const TODAY = "2026-08-06";

function makeTask(
  id: string,
  overrides: Partial<ConstructorParameters<typeof NoteTask>[0]> = {}
): NoteTask {
  return new NoteTask({
    id,
    summary: id,
    text: id,
    tags: [],
    status: "todo",
    priority: "",
    link: `tasks/${id}.md`,
    incomingLinks: [],
    starred: false,
    projects: [],
    dates: [],
    ...overrides,
  });
}

function dates(entries: Record<string, string>): TaskDateProperty[] {
  return Object.entries(entries).map(([type, date]) => ({
    type: type as TaskDateProperty["type"],
    date,
  }));
}

/** A dated task: an explicit start and due, so its bar is never a proposal. */
function dated(
  id: string,
  start: string,
  due: string,
  extra: { blockers?: string[]; status?: TaskStatus } = {}
): NoteTask {
  return makeTask(id, {
    incomingLinks: extra.blockers ?? [],
    status: extra.status ?? "todo",
    dates: dates({ start, due }),
  });
}

function rowsOf(tasks: NoteTask[]) {
  return buildGanttRows(tasks, { today: TODAY, skipWeekends: false });
}

describe("planCascade", () => {
  describe("which tasks move", () => {
    it("moves a task that simply starts later, with nothing linking them", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        dated("later", "2026-08-17", "2026-08-18"),
      ]);

      const plan = planCascade("a", rows, 3);

      expect(plan.movingIds).toEqual(["a", "later"]);
      expect(plan.days).toBe(3);
    });

    it("leaves a task that starts earlier where it is", () => {
      const rows = rowsOf([
        dated("earlier", "2026-08-04", "2026-08-05"),
        dated("a", "2026-08-10", "2026-08-12"),
      ]);

      expect(planCascade("a", rows, 3).movingIds).toEqual(["a"]);
    });

    it("leaves work starting the same day alongside it", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        dated("alongside", "2026-08-10", "2026-08-11"),
      ]);

      expect(planCascade("a", rows, 3).movingIds).toEqual(["a"]);
    });

    it("still carries a dependent that is mis-dated to start early", () => {
      const rows = rowsOf([
        dated("a", "2026-08-20", "2026-08-21"),
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      expect(planCascade("a", rows, 3).movingIds).toEqual(["a", "b"]);
    });

    it("carries a whole chain of later work", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        dated("b", "2026-08-13", "2026-08-14", { blockers: ["a"] }),
        dated("c", "2026-08-17", "2026-08-18", { blockers: ["b"] }),
      ]);

      const plan = planCascade("b", rows, 3);

      expect(plan.movingIds).toEqual(["b", "c"]);
      expect(plan.heldIds).toEqual([]);
    });

    it("returns an empty plan for a task that is not on the chart", () => {
      const rows = rowsOf([dated("a", "2026-08-10", "2026-08-12")]);

      expect(planCascade("nope", rows, 3)).toMatchObject({
        movingIds: [],
        days: 0,
      });
    });

    it("resolves a mutually blocking pair instead of recursing forever", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12", { blockers: ["b"] }),
        dated("b", "2026-08-13", "2026-08-14", { blockers: ["a"] }),
      ]);

      expect(planCascade("a", rows, 2).movingIds).toEqual(["a", "b"]);
      expect(planCascade("a", rows, -2).movingIds).toEqual(["a", "b"]);
    });
  });

  describe("work that stays put", () => {
    it("leaves a later proposal where it is", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        makeTask("b", { incomingLinks: ["a"] }),
      ]);

      const plan = planCascade("a", rows, 4);

      expect(plan.movingIds).toEqual(["a"]);
      expect(plan.skippedInferredIds).toEqual(["b"]);
    });

    it("still moves a dated task sitting beyond a proposal", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        makeTask("b", { incomingLinks: ["a"] }),
        dated("c", "2026-08-20", "2026-08-21", { blockers: ["b"] }),
      ]);

      const plan = planCascade("a", rows, 4);

      expect(plan.movingIds).toEqual(["a", "c"]);
      expect(plan.skippedInferredIds).toEqual(["b"]);
      expect(plan.days).toBe(4);
    });

    it("leaves finished work where it is", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        dated("done", "2026-08-17", "2026-08-18", { status: "done" }),
        dated("canceled", "2026-08-19", "2026-08-20", { status: "canceled" }),
      ]);

      const plan = planCascade("a", rows, 3);

      expect(plan.movingIds).toEqual(["a"]);
      expect(plan.skippedCompletedIds).toEqual(["done", "canceled"]);
    });

    it("moves the seed even when it is finished or only a proposal", () => {
      const finished = rowsOf([
        dated("a", "2026-08-10", "2026-08-12", { status: "done" }),
      ]);
      const proposed = rowsOf([makeTask("a")]);

      expect(planCascade("a", finished, 2).movingIds).toEqual(["a"]);
      expect(planCascade("a", proposed, 2).movingIds).toEqual(["a"]);
    });
  });

  describe("how far a backwards drag gets", () => {
    /**
     * A seed with a carried task behind a blocker that is staying put: `x`
     * starts before the seed, so it never joins the move, and it finishes the
     * day before `c` starts — one day of room, whatever the drag asks for.
     */
    function heldChain() {
      return rowsOf([
        dated("x", "2026-08-10", "2026-08-23"),
        dated("s", "2026-08-20", "2026-08-21"),
        dated("c", "2026-08-25", "2026-08-26", { blockers: ["x", "s"] }),
        dated("d", "2026-08-28", "2026-08-29", { blockers: ["c"] }),
      ]);
    }

    it("drops the dragged bar exactly where it was let go", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-20"),
        // Dragged in front of the blocker it is already overlapping
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, -9);

      expect(plan.days).toBe(-9);
      expect(plan.shiftById.get("b")).toBe(-9);
      expect(plan.heldIds).toEqual([]);
    });

    it("carries a task only as far as its own blocker allows", () => {
      const plan = planCascade("s", heldChain(), -10);

      expect(plan.shiftById.get("s")).toBe(-10);
      expect(plan.shiftById.get("c")).toBe(-1);
      expect(plan.heldIds).toEqual(["c", "d"]);
    });

    it("keeps a dependent behind the task that was held back", () => {
      const plan = planCascade("s", heldChain(), -10);

      // c stops at 08-24..08-25, so d follows it to 08-26 rather than
      // running the full ten days and landing on top of it
      expect(plan.shiftById.get("d")).toBe(-2);
    });

    it("moves the whole set the full distance when nothing is in the way", () => {
      const plan = planCascade("s", heldChain(), -1);

      expect(plan.movingIds).toEqual(["s", "c", "d"]);
      expect(plan.heldIds).toEqual([]);
      expect([...plan.shiftById.values()]).toEqual([-1, -1, -1]);
    });

    it("leaves a task already overlapping its blocker where it is", () => {
      const rows = rowsOf([
        // Runs past c, which therefore has no room at all
        dated("x", "2026-08-10", "2026-08-25"),
        dated("s", "2026-08-14", "2026-08-15"),
        dated("c", "2026-08-20", "2026-08-21", { blockers: ["x"] }),
      ]);

      const plan = planCascade("s", rows, -5);

      expect(plan.movingIds).toEqual(["s"]);
      expect(plan.heldIds).toEqual(["c"]);
      // A plain zero, not the -0 that would later format as a negative day
      expect(Object.is(plan.shiftById.get("c"), 0)).toBe(true);
    });

    it("reports a plain zero for a task with exactly no room left", () => {
      const rows = rowsOf([
        dated("x", "2026-08-10", "2026-08-19"),
        dated("s", "2026-08-14", "2026-08-15"),
        // Starts the day after x ends: legal, but not a day earlier
        dated("c", "2026-08-20", "2026-08-21", { blockers: ["x"] }),
      ]);

      const plan = planCascade("s", rows, -5);

      expect(Object.is(plan.shiftById.get("c"), 0)).toBe(true);
    });

    it("does not hold back a forwards drag", () => {
      const plan = planCascade("s", heldChain(), 7);

      expect(plan.heldIds).toEqual([]);
      expect(plan.shiftById.get("c")).toBe(7);
    });

    it("ignores a blocker whose own dates are only a proposal", () => {
      const rows = rowsOf([
        makeTask("a"),
        dated("s", "2026-08-10", "2026-08-11"),
        dated("c", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      const plan = planCascade("s", rows, -5);

      expect(plan.shiftById.get("c")).toBe(-5);
      expect(plan.heldIds).toEqual([]);
    });

    it("ignores blockers that are filtered out of the chart", () => {
      const rows = rowsOf([
        dated("s", "2026-08-10", "2026-08-11"),
        dated("c", "2026-08-14", "2026-08-15", { blockers: ["missing"] }),
      ]);

      expect(planCascade("s", rows, -5).shiftById.get("c")).toBe(-5);
    });
  });
});
