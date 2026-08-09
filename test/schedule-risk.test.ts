import { ScheduleRiskTask, findScheduleRisks } from "../src/lib/schedule-risk";
import { TaskStatus } from "../src/types/task";

const TODAY = "2026-08-10";

function makeTask(
  id: string,
  overrides: Partial<ScheduleRiskTask> = {}
): ScheduleRiskTask {
  return {
    id,
    incomingLinks: [],
    status: "todo" as TaskStatus,
    start: "2026-08-10",
    end: "2026-08-12",
    startInferred: false,
    endInferred: false,
    ...overrides,
  };
}

function risks(tasks: ScheduleRiskTask[]) {
  return findScheduleRisks(tasks, { today: TODAY });
}

function kinds(tasks: ScheduleRiskTask[], id: string) {
  return (risks(tasks).get(id) ?? []).map((risk) => risk.kind);
}

describe("findScheduleRisks", () => {
  describe("overdue", () => {
    it("flags a task whose end has passed", () => {
      const tasks = [makeTask("a", { start: "2026-08-01", end: "2026-08-05" })];
      expect(kinds(tasks, "a")).toEqual(["overdue"]);
    });

    it("leaves a task ending today alone", () => {
      const tasks = [makeTask("a", { start: TODAY, end: TODAY })];
      expect(risks(tasks).has("a")).toBe(false);
    });

    it("leaves a suggested end alone", () => {
      // In progress, so the start cannot be what raises a flag here
      const tasks = [
        makeTask("a", {
          start: "2026-08-01",
          end: "2026-08-05",
          endInferred: true,
          status: "in_progress",
        }),
      ];
      expect(risks(tasks).has("a")).toBe(false);
    });

    it.each<TaskStatus>(["done", "canceled"])(
      "leaves a %s task alone",
      (status) => {
        const tasks = [
          makeTask("a", { start: "2026-08-01", end: "2026-08-05", status }),
        ];
        expect(risks(tasks).has("a")).toBe(false);
      }
    );

    it("still flags work in progress that has run past its end", () => {
      const tasks = [
        makeTask("a", {
          start: "2026-08-01",
          end: "2026-08-05",
          status: "in_progress",
        }),
      ];
      expect(kinds(tasks, "a")).toEqual(["overdue"]);
    });
  });

  describe("late start", () => {
    it("flags a task that should have started", () => {
      const tasks = [makeTask("a", { start: "2026-08-05", end: "2026-08-20" })];
      expect(kinds(tasks, "a")).toEqual(["late_start"]);
    });

    it("leaves a task alone once it is under way", () => {
      const tasks = [
        makeTask("a", {
          start: "2026-08-05",
          end: "2026-08-20",
          status: "in_progress",
        }),
      ];
      expect(risks(tasks).has("a")).toBe(false);
    });

    it("leaves a suggested start alone", () => {
      const tasks = [
        makeTask("a", {
          start: "2026-08-05",
          end: "2026-08-20",
          startInferred: true,
        }),
      ];
      expect(risks(tasks).has("a")).toBe(false);
    });

    it("says overdue rather than both", () => {
      const tasks = [makeTask("a", { start: "2026-08-01", end: "2026-08-05" })];
      expect(kinds(tasks, "a")).toEqual(["overdue"]);
    });
  });

  describe("conflicts", () => {
    it("flags a task starting before its blocker finishes", () => {
      const tasks = [
        makeTask("blocker", { start: "2026-08-10", end: "2026-08-20" }),
        makeTask("waiting", {
          start: "2026-08-15",
          end: "2026-08-25",
          incomingLinks: ["blocker"],
        }),
      ];

      expect(kinds(tasks, "waiting")).toEqual(["conflict"]);
      expect(risks(tasks).get("waiting")?.[0].blockerId).toBe("blocker");
    });

    it("flags a task starting the same day its blocker ends", () => {
      const tasks = [
        makeTask("blocker", { start: "2026-08-10", end: "2026-08-20" }),
        makeTask("waiting", {
          start: "2026-08-20",
          end: "2026-08-25",
          incomingLinks: ["blocker"],
        }),
      ];

      expect(kinds(tasks, "waiting")).toEqual(["conflict"]);
    });

    it("accepts a task starting the day after its blocker ends", () => {
      const tasks = [
        makeTask("blocker", { start: "2026-08-10", end: "2026-08-20" }),
        makeTask("waiting", {
          start: "2026-08-21",
          end: "2026-08-25",
          incomingLinks: ["blocker"],
        }),
      ];

      expect(risks(tasks).has("waiting")).toBe(false);
    });

    it("reports one conflict per offending blocker", () => {
      const tasks = [
        makeTask("one", { start: "2026-08-10", end: "2026-08-20" }),
        makeTask("two", { start: "2026-08-10", end: "2026-08-22" }),
        makeTask("waiting", {
          start: "2026-08-15",
          end: "2026-08-25",
          incomingLinks: ["one", "two"],
        }),
      ];

      expect(kinds(tasks, "waiting")).toEqual(["conflict", "conflict"]);
    });

    it("ignores a blocker that is already done", () => {
      const tasks = [
        makeTask("blocker", {
          start: "2026-08-10",
          end: "2026-08-20",
          status: "done",
        }),
        makeTask("waiting", {
          start: "2026-08-15",
          end: "2026-08-25",
          incomingLinks: ["blocker"],
        }),
      ];

      expect(risks(tasks).has("waiting")).toBe(false);
    });

    it("ignores a suggested start, which never contradicts its blockers", () => {
      const tasks = [
        makeTask("blocker", { start: "2026-08-10", end: "2026-08-20" }),
        makeTask("waiting", {
          start: "2026-08-15",
          end: "2026-08-25",
          startInferred: true,
          incomingLinks: ["blocker"],
        }),
      ];

      expect(risks(tasks).has("waiting")).toBe(false);
    });

    it("reports a conflict alongside being overdue", () => {
      const tasks = [
        makeTask("blocker", { start: "2026-08-01", end: "2026-08-20" }),
        makeTask("waiting", {
          start: "2026-08-02",
          end: "2026-08-05",
          incomingLinks: ["blocker"],
        }),
      ];

      expect(kinds(tasks, "waiting")).toEqual(["overdue", "conflict"]);
    });
  });

  describe("edge cases", () => {
    it("returns nothing for a healthy plan", () => {
      const tasks = [
        makeTask("a", { start: "2026-08-10", end: "2026-08-14" }),
        makeTask("b", {
          start: "2026-08-17",
          end: "2026-08-20",
          incomingLinks: ["a"],
        }),
      ];

      expect(risks(tasks).size).toBe(0);
    });

    it("ignores links to tasks that are not present", () => {
      const tasks = [
        makeTask("a", {
          start: "2026-08-10",
          end: "2026-08-14",
          incomingLinks: ["filtered-out"],
        }),
      ];

      expect(risks(tasks).size).toBe(0);
    });

    it("ignores a task blocking itself", () => {
      const tasks = [
        makeTask("a", {
          start: "2026-08-10",
          end: "2026-08-14",
          incomingLinks: ["a"],
        }),
      ];

      expect(risks(tasks).size).toBe(0);
    });
  });
});
