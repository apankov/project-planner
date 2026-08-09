import {
  plainTaskText,
  taskTextDescription,
  writeTextToTaskLine,
} from "../src/lib/task-text";

describe("plainTaskText", () => {
  it("strips wikilink brackets", () => {
    expect(plainTaskText("[[Spec Batteries]]")).toBe("Spec Batteries");
  });

  it("prefers the alias of an aliased wikilink", () => {
    expect(plainTaskText("[[Notes/Spec Batteries|Batteries]]")).toBe(
      "Batteries"
    );
  });

  it("drops the folder from an unaliased path", () => {
    expect(plainTaskText("[[Notes/Spec Batteries]]")).toBe("Spec Batteries");
  });

  it("handles a link in the middle of a sentence", () => {
    expect(plainTaskText("Review [[Gen1]] against requirements")).toBe(
      "Review Gen1 against requirements"
    );
  });

  it("handles several links", () => {
    expect(plainTaskText("[[A]] then [[B]]")).toBe("A then B");
  });

  it("unwraps markdown links", () => {
    expect(plainTaskText("See [the spec](https://example.com)")).toBe(
      "See the spec"
    );
  });

  it("unwraps inline code", () => {
    expect(plainTaskText("Fix `parseTaskLine`")).toBe("Fix parseTaskLine");
  });

  it("leaves plain text alone", () => {
    expect(plainTaskText("Order COTS parts")).toBe("Order COTS parts");
  });

  it("collapses the gaps left behind", () => {
    expect(plainTaskText("Review  [[Gen1]]  now")).toBe("Review Gen1 now");
  });

  it("returns an empty string for empty input", () => {
    expect(plainTaskText("")).toBe("");
  });
});

describe("taskTextDescription", () => {
  it("returns plain words unchanged", () => {
    expect(taskTextDescription("Order COTS parts")).toBe("Order COTS parts");
  });

  it.each([
    ["a tag", "Ship it #work", "Ship it"],
    ["an emoji id", "Ship it 🆔 abc123", "Ship it"],
    ["a dataview id", "Ship it [id:: abc123]", "Ship it"],
    ["an emoji due date", "Ship it 📅 2026-08-10", "Ship it"],
    ["an emoji start date", "Ship it 🛫 2026-08-01", "Ship it"],
    ["a dataview date", "Ship it [due:: 2026-08-10]", "Ship it"],
    ["a plain-text date", "Ship it due: 2026-08-10", "Ship it"],
    ["a dependency", "Ship it ⛔ abc123", "Ship it"],
    ["a csv dependency", "Ship it ⛔ abc123,def456", "Ship it"],
    ["progress", "Ship it [progress:: 40]", "Ship it"],
    ["a parent", "Ship it [parent:: abc123]", "Ship it"],
    ["finance", "Ship it [people:: Alice 60%]", "Ship it"],
    ["a priority", "Ship it ⏫", "Ship it"],
    ["a star", "Ship it ⭐", "Ship it"],
  ])("strips %s", (_name, text, expected) => {
    expect(taskTextDescription(text)).toBe(expected);
  });

  it("strips a whole line of metadata at once", () => {
    expect(
      taskTextDescription(
        "Ship it #work ⏫ 🆔 abc123 ⛔ def456 📅 2026-08-10 [progress:: 40] [hours:: 12]"
      )
    ).toBe("Ship it");
  });

  it("keeps metadata written between the words out of the way", () => {
    expect(taskTextDescription("Ship #work the thing 📅 2026-08-10")).toBe(
      "Ship the thing"
    );
  });

  // Unlike `summary`, this is the raw description: emoji and link syntax a
  // person typed are theirs, not the plugin's metadata
  it("keeps a wikilink as written", () => {
    expect(taskTextDescription("Review [[Spec Batteries]] #work")).toBe(
      "Review [[Spec Batteries]]"
    );
  });

  it("keeps an ordinary emoji", () => {
    expect(taskTextDescription("Ship it 🎉 #work")).toBe("Ship it 🎉");
  });

  it("returns an empty string for a line that is nothing but metadata", () => {
    expect(taskTextDescription("#work 📅 2026-08-10")).toBe("");
  });
});

describe("writeTextToTaskLine", () => {
  it("replaces the words and keeps the checkbox", () => {
    expect(writeTextToTaskLine("- [ ] Ship it", "Ship it properly")).toBe(
      "- [ ] Ship it properly"
    );
  });

  it("keeps every piece of metadata on the line", () => {
    expect(
      writeTextToTaskLine(
        "- [ ] Ship it #work 🆔 abc123 📅 2026-08-10 [progress:: 40]",
        "Ship it properly"
      )
    ).toBe(
      "- [ ] Ship it properly #work 🆔 abc123 📅 2026-08-10 [progress:: 40]"
    );
  });

  it("keeps the metadata in the order it was found", () => {
    expect(
      writeTextToTaskLine("- [ ] Ship it 📅 2026-08-10 #work", "Ship")
    ).toBe("- [ ] Ship 📅 2026-08-10 #work");
  });

  it("moves metadata written mid-sentence to the end", () => {
    expect(
      writeTextToTaskLine("- [ ] Ship #work the thing 📅 2026-08-10", "Ship it")
    ).toBe("- [ ] Ship it #work 📅 2026-08-10");
  });

  it("keeps a task's status marker", () => {
    expect(writeTextToTaskLine("- [x] Ship it", "Shipped")).toBe(
      "- [x] Shipped"
    );
    expect(writeTextToTaskLine("- [/] Ship it", "Shipping")).toBe(
      "- [/] Shipping"
    );
  });

  it("keeps the indentation of a nested list item", () => {
    expect(writeTextToTaskLine("    - [ ] Ship it #work", "Ship")).toBe(
      "    - [ ] Ship #work"
    );
  });

  it("accepts the other bullet characters", () => {
    expect(writeTextToTaskLine("* [ ] Ship it", "Ship")).toBe("* [ ] Ship");
    expect(writeTextToTaskLine("+ [ ] Ship it", "Ship")).toBe("+ [ ] Ship");
  });

  it("collapses whitespace in the new words", () => {
    expect(writeTextToTaskLine("- [ ] Ship it", "  Ship   it  now ")).toBe(
      "- [ ] Ship it now"
    );
  });

  it("survives a round trip through the description reader", () => {
    const line = "- [ ] Ship it #work 🆔 abc123 📅 2026-08-10";
    const description = taskTextDescription(
      "Ship it #work 🆔 abc123 📅 2026-08-10"
    );

    expect(writeTextToTaskLine(line, description)).toBe(line);
  });

  describe("edge cases", () => {
    it("leaves a line that is not a task alone", () => {
      expect(writeTextToTaskLine("Just a paragraph", "Nope")).toBe(
        "Just a paragraph"
      );
    });

    it("leaves a bare list item alone", () => {
      expect(writeTextToTaskLine("- Not a task", "Nope")).toBe("- Not a task");
    });

    it("keeps the metadata when the new words are empty", () => {
      expect(writeTextToTaskLine("- [ ] Ship it #work", "")).toBe(
        "- [ ] #work"
      );
    });
  });
});
