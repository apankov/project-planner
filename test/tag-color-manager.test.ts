import {
  PALETTE_SIZE,
  TAG_COLOR_DEFAULT,
  TAG_COLOR_NAMES,
  TAG_OVERRIDE_COLORS,
  TagColorOverrides,
  getTagColorClass,
  isTagColorName,
  setTagColorOverride,
} from "../src/lib/tag-color-manager";

describe("getTagColorClass", () => {
  it("derives a palette class from the tag name", () => {
    const cls = getTagColorClass("frontend", "ocean");
    expect(cls).toMatch(/^project-planner-tag--ocean-[0-7]$/);
  });

  it("is stable for the same tag and palette", () => {
    expect(getTagColorClass("frontend", "rainbow")).toBe(
      getTagColorClass("frontend", "rainbow")
    );
  });

  it("stays within the palette size", () => {
    const indices = new Set<number>();
    ["a", "bug", "feature", "docs", "blocked", "urgent", "x", "y"].forEach(
      (tag) => {
        const index = Number(getTagColorClass(tag, "rainbow").split("-").pop());
        indices.add(index);
      }
    );
    indices.forEach((index) => {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(PALETTE_SIZE);
    });
  });

  it("uses the manual color when the tag has an override", () => {
    const overrides: TagColorOverrides = { bug: "red" };
    expect(getTagColorClass("bug", "ocean", overrides)).toBe(
      "project-planner-tag--custom-red"
    );
  });

  it("falls back to the palette for tags without an override", () => {
    const overrides: TagColorOverrides = { bug: "red" };
    expect(getTagColorClass("feature", "ocean", overrides)).toMatch(
      /^project-planner-tag--ocean-[0-7]$/
    );
  });

  it("ignores an unknown color name from stale settings", () => {
    const overrides = { bug: "chartreuse" } as unknown as TagColorOverrides;
    expect(getTagColorClass("bug", "forest", overrides)).toMatch(
      /^project-planner-tag--forest-[0-7]$/
    );
  });

  it.each(TAG_COLOR_NAMES)("supports the %s override color", (color) => {
    expect(getTagColorClass("tag", "rainbow", { tag: color })).toBe(
      `project-planner-tag--custom-${color}`
    );
    expect(TAG_OVERRIDE_COLORS[color]).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("isTagColorName", () => {
  it("accepts known colors", () => {
    expect(isTagColorName("blue")).toBe(true);
  });

  it("rejects unknown colors and inherited properties", () => {
    expect(isTagColorName("chartreuse")).toBe(false);
    expect(isTagColorName("toString")).toBe(false);
  });
});

describe("setTagColorOverride", () => {
  it("assigns a color without mutating the original", () => {
    const overrides: TagColorOverrides = {};
    const next = setTagColorOverride(overrides, "bug", "red");
    expect(next).toEqual({ bug: "red" });
    expect(overrides).toEqual({});
  });

  it("replaces an existing assignment", () => {
    const next = setTagColorOverride({ bug: "red" }, "bug", "green");
    expect(next).toEqual({ bug: "green" });
  });

  it("removes the assignment when set back to the theme default", () => {
    const next = setTagColorOverride({ bug: "red" }, "bug", TAG_COLOR_DEFAULT);
    expect(next).toEqual({});
  });

  it("leaves other tags untouched", () => {
    const next = setTagColorOverride(
      { bug: "red", docs: "blue" },
      "bug",
      TAG_COLOR_DEFAULT
    );
    expect(next).toEqual({ docs: "blue" });
  });

  describe("edge cases", () => {
    it("drops an unknown color instead of storing it", () => {
      const next = setTagColorOverride(
        { bug: "red" },
        "bug",
        "chartreuse" as never
      );
      expect(next).toEqual({});
    });

    it("handles tags that are not yet in the overrides", () => {
      expect(setTagColorOverride({}, "unused", TAG_COLOR_DEFAULT)).toEqual({});
    });
  });
});
