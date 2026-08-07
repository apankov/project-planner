import {
  EdgeCandidate,
  distanceToSegment,
  findEdgeUnderPoint,
} from "../src/lib/edge-hit-test";

function makeEdge(
  id: string,
  source: { x: number; y: number },
  target: { x: number; y: number },
  sourceId = `${id}-source`,
  targetId = `${id}-target`
): EdgeCandidate {
  return { id, sourceId, targetId, source, target };
}

describe("distanceToSegment", () => {
  it("is zero on the line", () => {
    expect(
      distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(0);
  });

  it("measures perpendicular distance", () => {
    expect(
      distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(3);
  });

  it("measures to the nearest end when past it", () => {
    expect(
      distanceToSegment({ x: 20, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(10);
  });

  it("copes with a zero-length segment", () => {
    expect(
      distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })
    ).toBe(5);
  });
});

describe("findEdgeUnderPoint", () => {
  const edges = [
    makeEdge("a-b", { x: 0, y: 0 }, { x: 100, y: 0 }, "a", "b"),
    makeEdge("c-d", { x: 0, y: 500 }, { x: 100, y: 500 }, "c", "d"),
  ];

  it("finds the connection under the point", () => {
    expect(findEdgeUnderPoint({ x: 50, y: 5 }, edges, "x")?.id).toBe("a-b");
  });

  it("returns nothing when the point is far from every connection", () => {
    expect(findEdgeUnderPoint({ x: 50, y: 250 }, edges, "x")).toBeNull();
  });

  it("prefers the nearer connection", () => {
    const close = makeEdge("close", { x: 0, y: 20 }, { x: 100, y: 20 });
    expect(
      findEdgeUnderPoint({ x: 50, y: 18 }, [...edges, close], "x")?.id
    ).toBe("close");
  });

  it("ignores a connection the dragged task is the source of", () => {
    expect(findEdgeUnderPoint({ x: 50, y: 5 }, edges, "a")).toBeNull();
  });

  it("ignores a connection the dragged task is the target of", () => {
    expect(findEdgeUnderPoint({ x: 50, y: 5 }, edges, "b")).toBeNull();
  });

  it("respects a custom threshold", () => {
    expect(findEdgeUnderPoint({ x: 50, y: 30 }, edges, "x", 10)).toBeNull();
    expect(findEdgeUnderPoint({ x: 50, y: 30 }, edges, "x", 50)?.id).toBe(
      "a-b"
    );
  });

  it("returns nothing when there are no connections", () => {
    expect(findEdgeUnderPoint({ x: 0, y: 0 }, [], "x")).toBeNull();
  });
});
