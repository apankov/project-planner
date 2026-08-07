import { UndoHistory } from "../src/lib/undo-history";

describe("UndoHistory", () => {
  it("has nothing to undo when empty", () => {
    const history = new UndoHistory();
    expect(history.canUndo()).toBe(false);
    expect(history.peekLabel()).toBeNull();
  });

  it("reports the most recent action", () => {
    const history = new UndoHistory();
    history.push({ label: "first", undo: async () => {} });
    history.push({ label: "second", undo: async () => {} });

    expect(history.canUndo()).toBe(true);
    expect(history.peekLabel()).toBe("second");
  });

  it("runs the inverse of the last action", async () => {
    const history = new UndoHistory();
    const undone: string[] = [];
    history.push({
      label: "a",
      undo: async () => {
        undone.push("a");
      },
    });

    expect(await history.undoLast()).toBe("a");
    expect(undone).toEqual(["a"]);
  });

  it("works back through the stack, newest first", async () => {
    const history = new UndoHistory();
    const undone: string[] = [];
    for (const label of ["a", "b", "c"]) {
      history.push({
        label,
        undo: async () => {
          undone.push(label);
        },
      });
    }

    await history.undoLast();
    await history.undoLast();
    expect(undone).toEqual(["c", "b"]);
    expect(history.peekLabel()).toBe("a");
  });

  it("returns null when there is nothing left", async () => {
    const history = new UndoHistory();
    expect(await history.undoLast()).toBeNull();
  });

  it("notifies subscribers when the stack changes", () => {
    const history = new UndoHistory();
    let calls = 0;
    const unsubscribe = history.subscribe(() => {
      calls += 1;
    });

    history.push({ label: "a", undo: async () => {} });
    expect(calls).toBe(1);

    unsubscribe();
    history.push({ label: "b", undo: async () => {} });
    expect(calls).toBe(1);
  });

  it("forgets everything when cleared", () => {
    const history = new UndoHistory();
    history.push({ label: "a", undo: async () => {} });
    history.clear();
    expect(history.canUndo()).toBe(false);
  });

  it("caps how far back it remembers", () => {
    const history = new UndoHistory();
    for (let index = 0; index < 60; index++) {
      history.push({ label: `action ${index}`, undo: async () => {} });
    }
    expect(history.peekLabel()).toBe("action 59");
  });

  describe("edge cases", () => {
    it("does not put a failed undo back on the stack", async () => {
      const history = new UndoHistory();
      history.push({
        label: "boom",
        undo: async () => {
          throw new Error("vault write failed");
        },
      });

      await expect(history.undoLast()).rejects.toThrow("vault write failed");
      expect(history.canUndo()).toBe(false);
    });

    it("ignores a second undo while one is still running", async () => {
      const history = new UndoHistory();
      let release: (() => void) | null = null;
      const started = new Promise<void>((resolve) => {
        release = resolve;
      });

      history.push({ label: "slow", undo: () => started });
      history.push({ label: "quick", undo: async () => {} });

      const first = history.undoLast();
      expect(history.canUndo()).toBe(false);

      const second = await history.undoLast();
      expect(second).toBeNull();

      release?.();
      await first;
    });
  });
});
