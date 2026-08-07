import { NoteTask } from "../src/types/note-task";
import {
  connectionKey,
  getConnectionHighlight,
  isHighlightActive,
} from "../src/lib/connection-highlight";

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

// a -> b -> c, with d hanging off b, and z unrelated
const CHAIN = [
  makeTask("a"),
  makeTask("b", ["a"]),
  makeTask("c", ["b"]),
  makeTask("d", ["b"]),
  makeTask("z"),
];

describe("getConnectionHighlight", () => {
  it("includes the selected task", () => {
    const highlight = getConnectionHighlight("b", CHAIN);
    expect(highlight.taskIds.has("b")).toBe(true);
  });

  it("includes everything upstream", () => {
    const highlight = getConnectionHighlight("c", CHAIN);
    expect([...highlight.taskIds].sort()).toEqual(["a", "b", "c"]);
  });

  it("includes everything downstream", () => {
    const highlight = getConnectionHighlight("a", CHAIN);
    expect([...highlight.taskIds].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("includes both directions from a task in the middle", () => {
    const highlight = getConnectionHighlight("b", CHAIN);
    expect([...highlight.taskIds].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves unrelated tasks out", () => {
    const highlight = getConnectionHighlight("b", CHAIN);
    expect(highlight.taskIds.has("z")).toBe(false);
  });

  it("lights the connections between highlighted tasks", () => {
    const highlight = getConnectionHighlight("b", CHAIN);
    expect([...highlight.edgeKeys].sort()).toEqual([
      connectionKey("a", "b"),
      connectionKey("b", "c"),
      connectionKey("b", "d"),
    ]);
  });

  it("does not light a connection to a task off the chain", () => {
    const tasks = [...CHAIN, makeTask("outsider"), makeTask("e", ["outsider"])];
    const highlight = getConnectionHighlight("a", tasks);
    expect(highlight.edgeKeys.has(connectionKey("outsider", "e"))).toBe(false);
  });

  describe("edge cases", () => {
    it("returns nothing when no task is selected", () => {
      const highlight = getConnectionHighlight(null, CHAIN);
      expect(highlight.taskIds.size).toBe(0);
      expect(isHighlightActive(highlight)).toBe(false);
    });

    it("returns nothing when the task is not on screen", () => {
      const highlight = getConnectionHighlight("filtered-out", CHAIN);
      expect(highlight.taskIds.size).toBe(0);
    });

    it("highlights a lone task with no connections", () => {
      const highlight = getConnectionHighlight("z", CHAIN);
      expect([...highlight.taskIds]).toEqual(["z"]);
      expect(highlight.edgeKeys.size).toBe(0);
    });

    it("ignores links to tasks that are filtered out", () => {
      const tasks = [makeTask("b", ["missing"])];
      const highlight = getConnectionHighlight("b", tasks);
      expect([...highlight.taskIds]).toEqual(["b"]);
      expect(highlight.edgeKeys.size).toBe(0);
    });

    it("terminates on a dependency cycle", () => {
      const tasks = [makeTask("a", ["b"]), makeTask("b", ["a"])];
      const highlight = getConnectionHighlight("a", tasks);
      expect([...highlight.taskIds].sort()).toEqual(["a", "b"]);
    });
  });
});
