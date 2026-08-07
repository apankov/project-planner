import {
  DEFAULT_EDGE_STYLE,
  EDGE_COLOR_NAMES,
  EdgeStyleOverrides,
  clearEdgeStyleOverride,
  edgeMarkerId,
  edgeStyleKey,
  getEdgeStyle,
  getEdgeStyleClasses,
  isDefaultEdgeStyle,
  setEdgeStyleOverride,
  showsArrowAtEnd,
  showsArrowAtStart,
} from "../src/lib/edge-style-manager";

const RED_DASHED = {
  color: "red" as const,
  pattern: "dashed" as const,
  arrows: "both" as const,
};

describe("edgeStyleKey", () => {
  it("keys on the pair of task ids, blocker first", () => {
    expect(edgeStyleKey("abc123", "def456")).toBe("abc123->def456");
  });

  it("is direction-sensitive", () => {
    expect(edgeStyleKey("a", "b")).not.toBe(edgeStyleKey("b", "a"));
  });
});

describe("getEdgeStyle", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(getEdgeStyle({}, "a", "b")).toEqual(DEFAULT_EDGE_STYLE);
  });

  it("returns the stored style", () => {
    const overrides: EdgeStyleOverrides = { "a->b": RED_DASHED };
    expect(getEdgeStyle(overrides, "a", "b")).toEqual(RED_DASHED);
  });

  it("does not leak a style to the reverse connection", () => {
    const overrides: EdgeStyleOverrides = { "a->b": RED_DASHED };
    expect(getEdgeStyle(overrides, "b", "a")).toEqual(DEFAULT_EDGE_STYLE);
  });

  it("copes with undefined overrides", () => {
    expect(getEdgeStyle(undefined, "a", "b")).toEqual(DEFAULT_EDGE_STYLE);
  });
});

describe("setEdgeStyleOverride", () => {
  it("stores a style without mutating the original", () => {
    const overrides: EdgeStyleOverrides = {};
    const next = setEdgeStyleOverride(overrides, "a", "b", RED_DASHED);
    expect(next["a->b"]).toEqual(RED_DASHED);
    expect(overrides).toEqual({});
  });

  it("replaces an existing style", () => {
    const next = setEdgeStyleOverride({ "a->b": RED_DASHED }, "a", "b", {
      color: "blue",
      pattern: "solid",
      arrows: "end",
    });
    expect(next["a->b"].color).toBe("blue");
  });

  it("drops the entry when the style is back to the default", () => {
    const next = setEdgeStyleOverride(
      { "a->b": RED_DASHED },
      "a",
      "b",
      DEFAULT_EDGE_STYLE
    );
    expect(next).toEqual({});
  });

  it("leaves other connections alone", () => {
    const next = setEdgeStyleOverride(
      { "a->b": RED_DASHED, "c->d": RED_DASHED },
      "a",
      "b",
      DEFAULT_EDGE_STYLE
    );
    expect(Object.keys(next)).toEqual(["c->d"]);
  });
});

describe("clearEdgeStyleOverride", () => {
  it("removes just that connection", () => {
    const next = clearEdgeStyleOverride(
      { "a->b": RED_DASHED, "c->d": RED_DASHED },
      "a",
      "b"
    );
    expect(Object.keys(next)).toEqual(["c->d"]);
  });

  it("is a no-op for an unstyled connection", () => {
    expect(clearEdgeStyleOverride({}, "a", "b")).toEqual({});
  });
});

describe("isDefaultEdgeStyle", () => {
  it("recognises the default", () => {
    expect(isDefaultEdgeStyle(DEFAULT_EDGE_STYLE)).toBe(true);
  });

  it.each([
    ["colour", { ...DEFAULT_EDGE_STYLE, color: "red" as const }],
    ["pattern", { ...DEFAULT_EDGE_STYLE, pattern: "dotted" as const }],
    ["arrows", { ...DEFAULT_EDGE_STYLE, arrows: "none" as const }],
  ])("spots a changed %s", (_field, style) => {
    expect(isDefaultEdgeStyle(style)).toBe(false);
  });
});

describe("getEdgeStyleClasses", () => {
  it("adds nothing for the default style", () => {
    expect(getEdgeStyleClasses(DEFAULT_EDGE_STYLE)).toEqual([]);
  });

  it("adds a colour and a pattern class", () => {
    expect(getEdgeStyleClasses(RED_DASHED)).toEqual([
      "tasks-map-hash-edge-path--color-red",
      "tasks-map-hash-edge-path--dashed",
    ]);
  });
});

describe("arrow helpers", () => {
  it.each([
    ["end", false, true],
    ["start", true, false],
    ["both", true, true],
    ["none", false, false],
  ])("%s puts arrows in the right places", (arrows, atStart, atEnd) => {
    const style = {
      ...DEFAULT_EDGE_STYLE,
      arrows: arrows as "end" | "start" | "both" | "none",
    };
    expect(showsArrowAtStart(style)).toBe(atStart);
    expect(showsArrowAtEnd(style)).toBe(atEnd);
  });
});

describe("edgeMarkerId", () => {
  it("gives every colour its own marker", () => {
    const ids = new Set(EDGE_COLOR_NAMES.map(edgeMarkerId));
    expect(ids.size).toBe(EDGE_COLOR_NAMES.length);
  });
});
