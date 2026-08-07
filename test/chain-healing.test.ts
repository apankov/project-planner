import { NoteTask } from "../src/types/note-task";
import { findDependents, planChainHealing } from "../src/lib/chain-healing";

function makeTask(id: string, incomingLinks: string[] = []): NoteTask {
  return new NoteTask({
    id,
    summary: id,
    text: id,
    tags: [],
    status: "todo",
    priority: "",
    link: "tasks/test.md",
    incomingLinks,
    starred: false,
    projects: [],
    dates: [],
  });
}

describe("findDependents", () => {
  it("finds the tasks waiting on this one", () => {
    const tasks = [makeTask("a"), makeTask("b", ["a"]), makeTask("c", ["a"])];
    expect(findDependents("a", tasks).map((task) => task.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("returns nothing when nothing waits on it", () => {
    expect(findDependents("a", [makeTask("a")])).toEqual([]);
  });
});

describe("planChainHealing", () => {
  it("joins A to C when B is removed from A -> B -> C", () => {
    const tasks = [makeTask("a"), makeTask("b", ["a"]), makeTask("c", ["b"])];
    expect(planChainHealing("b", tasks)).toEqual([{ fromId: "a", toId: "c" }]);
  });

  it("joins every blocker to every dependent", () => {
    const tasks = [
      makeTask("a1"),
      makeTask("a2"),
      makeTask("b", ["a1", "a2"]),
      makeTask("c1", ["b"]),
      makeTask("c2", ["b"]),
    ];
    expect(planChainHealing("b", tasks)).toEqual([
      { fromId: "a1", toId: "c1" },
      { fromId: "a1", toId: "c2" },
      { fromId: "a2", toId: "c1" },
      { fromId: "a2", toId: "c2" },
    ]);
  });

  it("plans nothing when the task has no blockers", () => {
    const tasks = [makeTask("b"), makeTask("c", ["b"])];
    expect(planChainHealing("b", tasks)).toEqual([]);
  });

  it("plans nothing when nothing waits on the task", () => {
    const tasks = [makeTask("a"), makeTask("b", ["a"])];
    expect(planChainHealing("b", tasks)).toEqual([]);
  });

  it("skips a link that already exists", () => {
    const tasks = [
      makeTask("a"),
      makeTask("b", ["a"]),
      makeTask("c", ["b", "a"]),
    ];
    expect(planChainHealing("b", tasks)).toEqual([]);
  });

  it("never links a task to itself through a cycle", () => {
    const tasks = [makeTask("a", ["b"]), makeTask("b", ["a"])];
    expect(planChainHealing("b", tasks)).toEqual([]);
  });

  it("ignores blockers that are no longer in the graph", () => {
    const tasks = [makeTask("b", ["gone"]), makeTask("c", ["b"])];
    expect(planChainHealing("b", tasks)).toEqual([]);
  });

  it("returns nothing for a task that is not there", () => {
    expect(planChainHealing("missing", [makeTask("a")])).toEqual([]);
  });
});
