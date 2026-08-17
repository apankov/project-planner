import {
  HandoverGraphEdge,
  HandoverGraphNode,
  buildDependencyGraphs,
} from "../src/lib/handover/handover-graph";

function node(
  id: string,
  overrides: Partial<HandoverGraphNode> = {}
): HandoverGraphNode {
  return {
    id,
    label: `Task ${id}`,
    status: "todo",
    critical: false,
    ...overrides,
  };
}

function edge(
  fromId: string,
  toId: string,
  critical = false
): HandoverGraphEdge {
  return { fromId, toId, critical };
}

describe("buildDependencyGraphs", () => {
  it("draws nothing and reports every task when there are no edges", () => {
    const result = buildDependencyGraphs([node("a"), node("b")], []);

    expect(result.drawings).toHaveLength(0);
    expect(result.isolatedIds.sort()).toEqual(["a", "b"]);
  });

  it("draws one picture per unconnected chain", () => {
    const result = buildDependencyGraphs(
      [node("a"), node("b"), node("c"), node("d")],
      [edge("a", "b"), edge("c", "d")]
    );

    expect(result.drawings).toHaveLength(2);
    expect(result.isolatedIds).toEqual([]);
  });

  it("keeps a lone task out of the pictures", () => {
    const result = buildDependencyGraphs(
      [node("a"), node("b"), node("alone")],
      [edge("a", "b")]
    );

    expect(result.drawings).toHaveLength(1);
    expect(result.isolatedIds).toEqual(["alone"]);
  });

  it("puts the busiest chain first", () => {
    const result = buildDependencyGraphs(
      [node("a"), node("b"), node("c"), node("d"), node("e")],
      [edge("a", "b"), edge("c", "d"), edge("d", "e")]
    );

    expect(result.drawings[0].nodeCount).toBe(3);
    expect(result.drawings[1].nodeCount).toBe(2);
  });

  it("treats two tasks blocked by the same third as one chain", () => {
    const result = buildDependencyGraphs(
      [node("root"), node("left"), node("right")],
      [edge("root", "left"), edge("root", "right")]
    );

    expect(result.drawings).toHaveLength(1);
    expect(result.drawings[0].nodeCount).toBe(3);
  });

  it("produces a self-contained SVG document", () => {
    const result = buildDependencyGraphs(
      [node("a"), node("b")],
      [edge("a", "b")]
    );
    const { svg } = result.drawings[0];

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("<script");
  });

  it("is wide enough for every layer it lays out", () => {
    const chain = buildDependencyGraphs(
      [node("a"), node("b"), node("c")],
      [edge("a", "b"), edge("b", "c")]
    );
    const parallel = buildDependencyGraphs(
      [node("a"), node("b"), node("c")],
      [edge("a", "b"), edge("a", "c")]
    );

    // Three layers has to be wider than two, whatever the exact numbers are
    expect(chain.drawings[0].width).toBeGreaterThan(
      parallel.drawings[0].width
    );
  });

  it("marks the critical path in the accent colour", () => {
    const result = buildDependencyGraphs(
      [node("a", { critical: true }), node("b", { critical: true })],
      [edge("a", "b", true)]
    );

    expect(result.drawings[0].svg).toContain("#b4472f");
  });

  describe("labels", () => {
    it("escapes markup so a task name cannot break the drawing", () => {
      const result = buildDependencyGraphs(
        [node("a", { label: "<script>alert(1)</script>" }), node("b")],
        [edge("a", "b")]
      );

      expect(result.drawings[0].svg).not.toContain("<script>");
      expect(result.drawings[0].svg).toContain("&lt;script&gt;");
    });

    it("shortens a name too long for its box", () => {
      const result = buildDependencyGraphs(
        [node("a", { label: "word ".repeat(60).trim() }), node("b")],
        [edge("a", "b")]
      );

      expect(result.drawings[0].svg).toContain("…");
    });

    it("prints the ID so the register can be matched to the picture", () => {
      const result = buildDependencyGraphs(
        [node("task-42"), node("b")],
        [edge("task-42", "b")]
      );

      expect(result.drawings[0].svg).toContain("task-42");
    });
  });

  describe("edge cases", () => {
    it("terminates on a dependency loop and still draws it", () => {
      const result = buildDependencyGraphs(
        [node("a"), node("b"), node("c")],
        [edge("a", "b"), edge("b", "c"), edge("c", "a")]
      );

      expect(result.drawings).toHaveLength(1);
      expect(result.drawings[0].nodeCount).toBe(3);
      // The edge closing the loop is drawn dashed rather than dropped
      expect(result.drawings[0].svg).toContain("stroke-dasharray");
    });

    it("survives two tasks blocking each other", () => {
      const result = buildDependencyGraphs(
        [node("a"), node("b")],
        [edge("a", "b"), edge("b", "a")]
      );

      expect(result.drawings).toHaveLength(1);
      expect(result.drawings[0].nodeCount).toBe(2);
    });

    it("ignores a task that blocks itself", () => {
      const result = buildDependencyGraphs([node("a")], [edge("a", "a")]);

      expect(result.drawings).toHaveLength(0);
      expect(result.isolatedIds).toEqual(["a"]);
    });

    it("ignores an edge pointing at a task that is not here", () => {
      const result = buildDependencyGraphs(
        [node("a")],
        [edge("a", "filtered-out")]
      );

      expect(result.drawings).toHaveLength(0);
      expect(result.isolatedIds).toEqual(["a"]);
    });

    it("handles an empty graph", () => {
      expect(buildDependencyGraphs([], [])).toEqual({
        drawings: [],
        isolatedIds: [],
      });
    });

    it("lays the same graph out the same way twice", () => {
      const nodes = [node("a"), node("b"), node("c"), node("d")];
      const edges = [edge("a", "c"), edge("b", "c"), edge("c", "d")];

      expect(buildDependencyGraphs(nodes, edges).drawings[0].svg).toBe(
        buildDependencyGraphs(nodes, edges).drawings[0].svg
      );
    });
  });
});
