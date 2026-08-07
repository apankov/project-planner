import {
  companionNoteContent,
  companionNoteName,
  linkifyTaskLine,
} from "../src/lib/companion-note";

describe("companionNoteName", () => {
  it("uses the summary as the note name", () => {
    expect(companionNoteName("Spec Batteries")).toBe("Spec Batteries");
  });

  it.each([
    ["slashes", "Design A/B rig", "Design A B rig"],
    ["colons", "Review: Gen1", "Review  Gen1"],
    ["brackets", "Order [COTS] parts", "Order  COTS  parts"],
    ["pipes", "Cut|shape", "Cut shape"],
    ["hashes", "Order #2 parts", "Order  2 parts"],
  ])("replaces %s that a filename cannot contain", (_case, input, expected) => {
    // Illegal characters become spaces, then runs of spaces collapse
    expect(companionNoteName(input)).toBe(expected.replace(/\s+/g, " ").trim());
  });

  it("unwraps a summary that is already a wikilink", () => {
    expect(companionNoteName("[[Review Gen1]]")).toBe("Review Gen1");
  });

  it("takes the target of an aliased wikilink, flattening the path", () => {
    // The slash has to go: it would otherwise create a subfolder
    expect(companionNoteName("[[Notes/Review|Review]]")).toBe("Notes Review");
  });

  it("truncates a very long summary", () => {
    const name = companionNoteName("x".repeat(200));
    expect(name.length).toBe(80);
  });

  it("returns nothing for an empty summary", () => {
    expect(companionNoteName("   ")).toBe("");
  });
});

describe("linkifyTaskLine", () => {
  it("replaces the summary with a link, keeping the metadata", () => {
    const line = "- [ ] Spec Batteries 🆔 5d2zu2 ⛔ uqgn2y #Electrical";
    expect(linkifyTaskLine(line, "Spec Batteries", "Spec Batteries")).toBe(
      "- [ ] [[Spec Batteries]] 🆔 5d2zu2 ⛔ uqgn2y #Electrical"
    );
  });

  it("keeps dates and tags in place", () => {
    const line = "- [ ] Order parts 📅 2026-08-20 #Mechanical";
    expect(linkifyTaskLine(line, "Order parts", "Order parts")).toBe(
      "- [ ] [[Order parts]] 📅 2026-08-20 #Mechanical"
    );
  });

  it("appends the link when the summary is not in the line verbatim", () => {
    const line = "- [ ] Order   parts";
    expect(linkifyTaskLine(line, "Order parts", "Order parts")).toBe(
      "- [ ] Order   parts [[Order parts]]"
    );
  });

  it("does not add a second link to an already-linked line", () => {
    const line = "- [ ] [[Spec Batteries]] 🆔 5d2zu2";
    expect(linkifyTaskLine(line, "Spec Batteries", "Spec Batteries")).toBe(
      line
    );
  });

  it("leaves the line alone when there is no note name", () => {
    const line = "- [ ] Something";
    expect(linkifyTaskLine(line, "Something", "")).toBe(line);
  });

  it("links to a sanitised name that differs from the summary", () => {
    const line = "- [ ] Design A/B rig";
    expect(linkifyTaskLine(line, "Design A/B rig", "Design A B rig")).toBe(
      "- [ ] [[Design A B rig]]"
    );
  });
});

describe("companionNoteContent", () => {
  it("titles the note", () => {
    expect(companionNoteContent("Spec Batteries")).toContain(
      "# Spec Batteries"
    );
  });

  it("does not tag the note as a task, which would duplicate it in the map", () => {
    const content = companionNoteContent("Spec Batteries");
    expect(content).not.toMatch(/^\s*-\s*task\s*$/m);
    expect(content).toContain("task-note: true");
  });
});
