import { CriticalPathTask, findCriticalPath } from "../src/lib/critical-path";

function makeTask(
  id: string,
  start: string,
  end: string,
  incomingLinks: string[] = []
): CriticalPathTask {
  return { id, start, end, incomingLinks };
}

describe("findCriticalPath", () => {
  describe("project finish", () => {
    it("is the latest end across every task", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05"),
        makeTask("b", "2026-08-03", "2026-08-11"),
        makeTask("c", "2026-08-03", "2026-08-07"),
      ]);

      expect(result.projectFinish).toBe("2026-08-11");
    });

    it("is null when there are no tasks", () => {
      expect(findCriticalPath([]).projectFinish).toBeNull();
    });
  });

  describe("float", () => {
    it("gives the task finishing last no float", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05"),
        makeTask("last", "2026-08-03", "2026-08-11"),
      ]);

      expect(result.floatByTaskId.get("last")).toBe(0);
      expect(result.criticalIds.has("last")).toBe(true);
    });

    it("measures how far a task can slip before the plan does", () => {
      // "a" finishes six days before the plan does and nothing waits on it
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05"),
        makeTask("last", "2026-08-03", "2026-08-11"),
      ]);

      expect(result.floatByTaskId.get("a")).toBe(6);
      expect(result.criticalIds.has("a")).toBe(false);
    });

    it("takes the float from a successor, not from the plan's end", () => {
      // a -> b, and b finishes well before the unrelated "long" task does, so
      // a's slack is bounded by b rather than by the project finish
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-04"),
        makeTask("b", "2026-08-06", "2026-08-07", ["a"]),
        makeTask("long", "2026-08-03", "2026-08-20"),
      ]);

      // b is two days long and can finish as late as the 20th, so it could
      // start on the 19th, which leaves a until the 18th to be out of the way
      expect(result.floatByTaskId.get("b")).toBe(13);
      expect(result.floatByTaskId.get("a")).toBe(14);
    });

    it("uses the tightest of several successors", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-04"),
        makeTask("soon", "2026-08-05", "2026-08-06", ["a"]),
        makeTask("later", "2026-08-10", "2026-08-11", ["a"]),
        makeTask("last", "2026-08-03", "2026-08-11"),
      ]);

      // "soon" has five days of slack, "later" has none, so a is pinned by it
      expect(result.floatByTaskId.get("later")).toBe(0);
      expect(result.floatByTaskId.get("a")).toBe(5);
    });

    it("is negative when a task already finishes too late", () => {
      // b must start on the 4th, so a had to be finished on the 3rd
      const result = findCriticalPath([
        makeTask("a", "2026-08-01", "2026-08-06"),
        makeTask("b", "2026-08-04", "2026-08-20", ["a"]),
      ]);

      expect(result.floatByTaskId.get("a")).toBe(-3);
      expect(result.criticalIds.has("a")).toBe(true);
    });
  });

  describe("the path itself", () => {
    it("follows the longest chain to the finish", () => {
      // short: one day. long: two chained tasks running to the finish date.
      const result = findCriticalPath([
        makeTask("start", "2026-08-03", "2026-08-04"),
        makeTask("short", "2026-08-05", "2026-08-06", ["start"]),
        makeTask("long-a", "2026-08-05", "2026-08-10", ["start"]),
        makeTask("long-b", "2026-08-11", "2026-08-14", ["long-a"]),
      ]);

      expect([...result.criticalIds].sort()).toEqual([
        "long-a",
        "long-b",
        "start",
      ]);
    });

    it("marks the links along the chain and no others", () => {
      const result = findCriticalPath([
        makeTask("start", "2026-08-03", "2026-08-04"),
        makeTask("short", "2026-08-05", "2026-08-06", ["start"]),
        makeTask("long-a", "2026-08-05", "2026-08-10", ["start"]),
        makeTask("long-b", "2026-08-11", "2026-08-14", ["long-a"]),
      ]);

      expect([...result.criticalEdgeKeys].sort()).toEqual([
        "long-a->long-b",
        "start->long-a",
      ]);
    });

    it("leaves out a link with room in it between two critical tasks", () => {
      // "start" is pinned by "tight", which follows it immediately. "loose"
      // is critical too — it runs to the finish date — but it does not start
      // until the 20th, so the link feeding it has slack the path does not.
      const result = findCriticalPath([
        makeTask("start", "2026-08-03", "2026-08-10"),
        makeTask("tight", "2026-08-11", "2026-08-25", ["start"]),
        makeTask("loose", "2026-08-20", "2026-08-25", ["start"]),
      ]);

      expect([...result.criticalIds].sort()).toEqual([
        "loose",
        "start",
        "tight",
      ]);
      expect([...result.criticalEdgeKeys]).toEqual(["start->tight"]);
    });
  });

  describe("working days", () => {
    it("counts float in working days when weekends are skipped", () => {
      // Friday the 7th to Friday the 14th is five working days apart
      const result = findCriticalPath(
        [
          makeTask("a", "2026-08-03", "2026-08-07"),
          makeTask("last", "2026-08-03", "2026-08-14"),
        ],
        { skipWeekends: true }
      );

      expect(result.floatByTaskId.get("a")).toBe(5);
    });

    it("counts the same days as calendar days without the option", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-07"),
        makeTask("last", "2026-08-03", "2026-08-14"),
      ]);

      expect(result.floatByTaskId.get("a")).toBe(7);
    });

    it("keeps a blocker's latest finish off a weekend", () => {
      // "b" starts Monday the 10th; the day before is Sunday, so the last day
      // "a" could work is Friday the 7th
      const result = findCriticalPath(
        [
          makeTask("a", "2026-08-05", "2026-08-06"),
          makeTask("b", "2026-08-10", "2026-08-10", ["a"]),
        ],
        { skipWeekends: true }
      );

      expect(result.floatByTaskId.get("a")).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("ignores links to tasks that are not present", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05", ["filtered-out"]),
      ]);

      expect(result.criticalIds.has("a")).toBe(true);
      expect(result.criticalEdgeKeys.size).toBe(0);
    });

    it("ignores a task blocking itself", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05", ["a"]),
      ]);

      expect(result.floatByTaskId.get("a")).toBe(0);
      expect(result.criticalEdgeKeys.size).toBe(0);
    });

    it("resolves a mutually-blocking pair instead of hanging", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-05", ["b"]),
        makeTask("b", "2026-08-06", "2026-08-08", ["a"]),
      ]);

      expect(result.floatByTaskId.size).toBe(2);
      expect(result.projectFinish).toBe("2026-08-08");
    });

    it("gives every task an entry", () => {
      const result = findCriticalPath([
        makeTask("a", "2026-08-03", "2026-08-04"),
        makeTask("b", "2026-08-05", "2026-08-06", ["a"]),
        makeTask("c", "2026-08-07", "2026-08-08", ["b"]),
      ]);

      expect([...result.floatByTaskId.keys()].sort()).toEqual(["a", "b", "c"]);
    });
  });
});
