import { plainTaskText } from "../src/lib/task-text";

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
