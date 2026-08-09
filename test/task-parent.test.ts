import { PARENT_FIELD_REMOVAL } from "../src/lib/task-regex";
import {
  getFrontmatterParentId,
  getTaskParentId,
  normalizeParentId,
  parentFrontmatterPatch,
  writeParentToTaskLine,
} from "../src/lib/task-parent";

/** An inline task line carrying whatever metadata a case needs. */
function makeTask(metadata = ""): string {
  return `- [ ] Fit the loom${metadata ? ` ${metadata}` : ""} 🆔 a1b2c3`;
}

describe("getTaskParentId", () => {
  it("reads a parent off a task line", () => {
    expect(getTaskParentId(makeTask("[parent:: redesign]"))).toBe("redesign");
  });

  it("reads a task with no parent as standing alone", () => {
    expect(getTaskParentId(makeTask("📅 2026-03-06"))).toBeNull();
  });

  it.each<[string, string]>([
    ["[parent:: redesign]", "redesign"],
    ["(parent:: redesign)", "redesign"],
    ["[[parent:: redesign]]", "redesign"],
    ["[PARENT:: redesign]", "redesign"],
    ["[parent::redesign]", "redesign"],
    ["[parent::   redesign  ]", "redesign"],
    ["[parentId:: redesign]", "redesign"],
    ["[parent-id:: redesign]", "redesign"],
    ["[parent:: TaskNotes/Redesign.md]", "TaskNotes/Redesign.md"],
  ])("accepts %s", (metadata, expected) => {
    expect(getTaskParentId(makeTask(metadata))).toBe(expected);
  });
});

describe("normalizeParentId", () => {
  it.each<[string, string | null]>([
    ["redesign", "redesign"],
    ["  redesign  ", "redesign"],
    ['"redesign"', "redesign"],
    ["[[redesign]]", "redesign"],
    ["", null],
    ["   ", null],
  ])("reads %s as %s", (value, expected) => {
    expect(normalizeParentId(value)).toBe(expected);
  });

  it.each<[string, null | undefined]>([
    ["null", null],
    ["undefined", undefined],
  ])("reads %s as no parent", (_case, value) => {
    expect(normalizeParentId(value)).toBeNull();
  });
});

describe("writeParentToTaskLine", () => {
  it("appends a canonical field to a line that had none", () => {
    expect(writeParentToTaskLine(makeTask(), "redesign")).toBe(
      "- [ ] Fit the loom 🆔 a1b2c3 [parent:: redesign]"
    );
  });

  it("replaces whatever spelling was there", () => {
    const line = writeParentToTaskLine(
      makeTask("[parentId:: old]"),
      "redesign"
    );

    expect(line).toContain("[parent:: redesign]");
    expect(line).not.toContain("old");
    expect(line.match(PARENT_FIELD_REMOVAL)).toHaveLength(1);
  });

  it("strips the field when the parent is cleared", () => {
    expect(writeParentToTaskLine(makeTask("[parent:: redesign]"), null)).toBe(
      "- [ ] Fit the loom 🆔 a1b2c3"
    );
  });

  it("leaves every other piece of metadata alone", () => {
    const line = writeParentToTaskLine(
      makeTask("📅 2026-03-06 [progress:: 40] [hours:: 12] #weaving"),
      "redesign"
    );

    expect(line).toContain("📅 2026-03-06");
    expect(line).toContain("[progress:: 40]");
    expect(line).toContain("[hours:: 12]");
    expect(line).toContain("#weaving");
    expect(line).toContain("🆔 a1b2c3");
  });

  it("round-trips through the reader", () => {
    const line = writeParentToTaskLine(makeTask(), "redesign");

    expect(getTaskParentId(line)).toBe("redesign");
  });
});

describe("getFrontmatterParentId", () => {
  it.each<[string, Record<string, unknown>, string | null]>([
    ["parent", { parent: "redesign" }, "redesign"],
    ["parentId", { parentId: "redesign" }, "redesign"],
    ["a wiki link", { parent: "[[redesign]]" }, "redesign"],
    ["an empty value", { parent: "  " }, null],
    ["nothing at all", {}, null],
    ["a number", { parent: 42 }, null],
    ["a list", { parent: ["redesign"] }, null],
  ])("reads %s", (_case, frontmatter, expected) => {
    expect(getFrontmatterParentId(frontmatter)).toBe(expected);
  });

  it("prefers the canonical spelling when both are present", () => {
    expect(
      getFrontmatterParentId({ parent: "redesign", parentId: "other" })
    ).toBe("redesign");
  });
});

describe("parentFrontmatterPatch", () => {
  it("sets the canonical key and clears every other spelling", () => {
    const { set, remove } = parentFrontmatterPatch("redesign");

    expect(set).toEqual({ parent: "redesign" });
    expect(remove).toEqual(["parentId", "parent-id", "parentid"]);
  });

  it("removes every spelling when the parent is cleared", () => {
    const { set, remove } = parentFrontmatterPatch(null);

    expect(set).toEqual({});
    expect(remove).toEqual(["parent", "parentId", "parent-id", "parentid"]);
  });
});

describe("edge cases", () => {
  it("reads only the first parent field on a line", () => {
    expect(getTaskParentId(makeTask("[parent:: one] [parent:: two]"))).toBe(
      "one"
    );
  });

  it("clears every parent field on a line, not just the first", () => {
    const line = writeParentToTaskLine(
      makeTask("[parent:: one] [parentId:: two]"),
      null
    );

    expect(line).toBe("- [ ] Fit the loom 🆔 a1b2c3");
  });

  it("reads an empty field as no parent", () => {
    expect(getTaskParentId(makeTask("[parent:: ]"))).toBeNull();
  });

  it("does not mistake a progress field for a parent", () => {
    expect(getTaskParentId(makeTask("[progress:: 40]"))).toBeNull();
  });
});
