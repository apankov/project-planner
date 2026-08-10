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
      expect(plan.clamped).toBe(false);
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

  describe("clamping a backwards drag", () => {
    it("stops at the room a task left behind allows", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        // Four days of room: 08-13 is the earliest legal start
        dated("b", "2026-08-17", "2026-08-18", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, -6);

      expect(plan.days).toBe(-4);
      expect(plan.clamped).toBe(true);
    });

    it("leaves a backwards drag alone when there is room for it", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        dated("b", "2026-08-17", "2026-08-18", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, -3);

      expect(plan.days).toBe(-3);
      expect(plan.clamped).toBe(false);
    });

    it("takes the tightest blocker across the whole moving set", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-12"),
        // d starts before the seed, so it stays behind and constrains c
        dated("d", "2026-08-15", "2026-08-25"),
        dated("b", "2026-08-20", "2026-08-21", { blockers: ["a"] }),
        dated("c", "2026-08-27", "2026-08-28", { blockers: ["b", "d"] }),
      ]);

      const plan = planCascade("b", rows, -5);

      expect(plan.movingIds).toEqual(["b", "c"]);
      // a leaves b seven days, but d leaves c only one
      expect(plan.days).toBe(-1);
      expect(plan.clamped).toBe(true);
    });

    it("never deepens an overlap that was already there", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-20"),
        // Already starts before a finishes
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, -3);

      expect(plan.days).toBe(0);
      expect(plan.clamped).toBe(true);
    });

    it("does not clamp a forwards drag", () => {
      const rows = rowsOf([
        dated("a", "2026-08-10", "2026-08-20"),
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, 7);

      expect(plan.days).toBe(7);
      expect(plan.clamped).toBe(false);
    });

    it("ignores a blocker whose own dates are only a proposal", () => {
      const rows = rowsOf([
        makeTask("a"),
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["a"] }),
      ]);

      const plan = planCascade("b", rows, -5);

      expect(plan.days).toBe(-5);
      expect(plan.clamped).toBe(false);
    });

    it("ignores blockers that are filtered out of the chart", () => {
      const rows = rowsOf([
        dated("b", "2026-08-14", "2026-08-15", { blockers: ["missing"] }),
      ]);

      expect(planCascade("b", rows, -5).days).toBe(-5);
    });
  });
});
