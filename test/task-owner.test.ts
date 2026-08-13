import {
  getFrontmatterOwner,
  getTaskOwner,
  normalizeOwner,
  ownerFrontmatterPatch,
  writeOwnerToTaskLine,
} from "../src/lib/task-owner";

describe("normalizeOwner", () => {
  it("keeps a plain name", () => {
    expect(normalizeOwner("Alice Smith")).toBe("Alice Smith");
  });

  it("reads nothing as no owner", () => {
    expect(normalizeOwner("   ")).toBeNull();
    expect(normalizeOwner(null)).toBeNull();
    expect(normalizeOwner(undefined)).toBeNull();
  });

  it("unwraps a link, so a typed owner and a linked one match", () => {
    expect(normalizeOwner("[[Alice]]")).toBe("Alice");
  });

  it("takes a link's display text when it has one", () => {
    expect(normalizeOwner("[[People/Alice Smith|Alice]]")).toBe("Alice");
  });

  it("flattens a link that points into a folder", () => {
    expect(normalizeOwner("[[People/Alice]]")).toBe("Alice");
  });

  it("strips the quotes a YAML scalar leaves behind", () => {
    expect(normalizeOwner('"Alice"')).toBe("Alice");
  });
});

describe("getTaskOwner", () => {
  it("reads the field off a line", () => {
    expect(getTaskOwner("Fit the loom [owner:: Alice]")).toBe("Alice");
  });

  it("reads a linked owner", () => {
    expect(getTaskOwner("Fit the loom [owner:: [[Alice]]]")).toBe("Alice");
  });

  it.each(["assignee", "assignedTo", "assigned-to"])(
    "accepts the %s spelling",
    (field) => {
      expect(getTaskOwner(`Fit the loom [${field}:: Alice]`)).toBe("Alice");
    }
  );

  it("reads a line with no owner as unowned", () => {
    expect(getTaskOwner("Fit the loom 🆔 abc123")).toBeNull();
  });

  it("is not fooled by the word owner in the description", () => {
    expect(getTaskOwner("Find the owner of the loom")).toBeNull();
  });
});

describe("writeOwnerToTaskLine", () => {
  it("appends the canonical field", () => {
    expect(writeOwnerToTaskLine("- [ ] Fit the loom", "Alice")).toBe(
      "- [ ] Fit the loom [owner:: Alice]"
    );
  });

  it("replaces an owner the line already had", () => {
    expect(
      writeOwnerToTaskLine("- [ ] Fit the loom [owner:: Bob]", "Alice")
    ).toBe("- [ ] Fit the loom [owner:: Alice]");
  });

  it("rewrites a non-canonical spelling to the canonical one", () => {
    expect(
      writeOwnerToTaskLine("- [ ] Fit the loom [assignee:: Bob]", "Alice")
    ).toBe("- [ ] Fit the loom [owner:: Alice]");
  });

  it("takes the field off entirely when there is no owner", () => {
    expect(writeOwnerToTaskLine("- [ ] Fit the loom [owner:: Bob]", null)).toBe(
      "- [ ] Fit the loom"
    );
  });

  it("leaves every other piece of metadata alone", () => {
    const line =
      "- [ ] Fit the loom 🆔 abc123 📅 2026-08-20 #shop [hours:: 12]";
    expect(writeOwnerToTaskLine(line, "Alice")).toBe(`${line} [owner:: Alice]`);
  });

  it("writes a linked owner as plain text", () => {
    expect(writeOwnerToTaskLine("- [ ] Fit the loom", "[[Alice]]")).toBe(
      "- [ ] Fit the loom [owner:: Alice]"
    );
  });
});

describe("getFrontmatterOwner", () => {
  it("reads the canonical key", () => {
    expect(getFrontmatterOwner({ owner: "Alice" })).toBe("Alice");
  });

  it("reads a linked owner", () => {
    expect(getFrontmatterOwner({ owner: "[[Alice]]" })).toBe("Alice");
  });

  it("reads a one-entry list, which is what the properties editor writes", () => {
    expect(getFrontmatterOwner({ owner: ["Alice"] })).toBe("Alice");
  });

  it("reads a longer list as no owner: a task has one", () => {
    expect(getFrontmatterOwner({ owner: ["Alice", "Bob"] })).toBeNull();
  });

  it("falls back through the accepted spellings", () => {
    expect(getFrontmatterOwner({ assignee: "Alice" })).toBe("Alice");
  });

  it("prefers the canonical key over an older spelling", () => {
    expect(getFrontmatterOwner({ owner: "Alice", assignee: "Bob" })).toBe(
      "Alice"
    );
  });
});

describe("ownerFrontmatterPatch", () => {
  it("sets the canonical key", () => {
    expect(ownerFrontmatterPatch("Alice").set).toEqual({ owner: "Alice" });
  });

  it("removes every other spelling, so none can contradict it", () => {
    const { remove } = ownerFrontmatterPatch("Alice");
    expect(remove).toContain("assignee");
    expect(remove).toContain("assignedTo");
    expect(remove).not.toContain("owner");
  });

  it("removes the canonical key too when there is no owner", () => {
    const { set, remove } = ownerFrontmatterPatch(null);
    expect(set).toEqual({});
    expect(remove).toContain("owner");
  });
});
