import {
  OpenQuestion,
  answerBlockLines,
  getResolvedDate,
  parseAnswerBlock,
  writeAnswerToLines,
  matchesQuery,
  noteNameOf,
  openQuestionMarker,
  openQuestionMarkerCursor,
  parseOpenQuestionLine,
  scanOpenQuestions,
  sortOpenQuestions,
  writeResolvedToLine,
} from "../src/lib/open-question";

const NOTE = "Projects/Kohtari rollout.md";

function makeQuestion(overrides: Partial<OpenQuestion> = {}): OpenQuestion {
  return {
    id: `${NOTE}:0`,
    question: "Is the rollout date fixed?",
    resolved: false,
    resolvedOn: null,
    notePath: NOTE,
    noteName: "Kohtari rollout",
    line: 0,
    rawLine: "[oq:: Is the rollout date fixed?]",
    answer: null,
    answerEndLine: null,
    ...overrides,
  };
}

describe("parseOpenQuestionLine", () => {
  it.each([
    ["[oq:: Is it fixed?]", "Is it fixed?"],
    ["(oq:: Is it fixed?)", "Is it fixed?"],
    ["[[oq::Is it fixed?]]", "Is it fixed?"],
    ["[OQ::   Is it fixed?  ]", "Is it fixed?"],
    ["[openQuestion:: Is it fixed?]", "Is it fixed?"],
    ["[open-question:: Is it fixed?]", "Is it fixed?"],
    ["[openquestion:: Is it fixed?]", "Is it fixed?"],
  ])("reads %s as a question", (line, expected) => {
    expect(parseOpenQuestionLine(line, NOTE, 0)?.question).toBe(expected);
  });

  it("reads a question surrounded by other prose", () => {
    const line = "Some context first. [oq:: Who signs this off?] More after.";
    expect(parseOpenQuestionLine(line, NOTE, 3)?.question).toBe(
      "Who signs this off?"
    );
  });

  it("keeps a wiki-link inside the question whole", () => {
    const line = "[oq:: Does [[Kohtari rollout]] depend on the new rig?]";
    expect(parseOpenQuestionLine(line, NOTE, 0)?.question).toBe(
      "Does [[Kohtari rollout]] depend on the new rig?"
    );
  });

  it("records where it was found", () => {
    const question = parseOpenQuestionLine("[oq:: Why?]", NOTE, 7);

    expect(question).toMatchObject({
      id: `${NOTE}:7`,
      notePath: NOTE,
      noteName: "Kohtari rollout",
      line: 7,
      rawLine: "[oq:: Why?]",
      resolved: false,
      resolvedOn: null,
    });
  });

  it.each([
    ["a line with no marker", "Just an ordinary sentence."],
    ["an empty question", "[oq:: ]"],
    ["a similarly named field", "[question:: Is it fixed?]"],
  ])("reads no question from %s", (_case, line) => {
    expect(parseOpenQuestionLine(line, NOTE, 0)).toBeNull();
  });

  it.each([
    "- [ ] Ship the rig [oq:: Is it fixed?]",
    "- [x] Ship the rig [oq:: Is it fixed?]",
    "  * [ ] Ship the rig [oq:: Is it fixed?]",
  ])("ignores a marker written onto the task line %s", (line) => {
    expect(parseOpenQuestionLine(line, NOTE, 0)).toBeNull();
  });

  describe("resolved", () => {
    it("reads a question marked answered", () => {
      const line = "[oq:: Is it fixed?] [resolved:: 2025-01-01]";
      const question = parseOpenQuestionLine(line, NOTE, 0);

      expect(question?.question).toBe("Is it fixed?");
      expect(question?.resolved).toBe(true);
      expect(question?.resolvedOn).toBe("2025-01-01");
    });

    it.each([
      ["[oq:: Why?] [resolved:: 2025-01-01]", "2025-01-01"],
      ["[oq:: Why?] (answered:: 2025-01-01)", "2025-01-01"],
      ['[oq:: Why?] [resolved:: "2025-01-01"]', "2025-01-01"],
      ["[oq:: Why?] [RESOLVED::2025-01-01]", "2025-01-01"],
    ])("reads the answered date in %s", (line, expected) => {
      expect(getResolvedDate(line)).toBe(expected);
    });

    it("treats an empty resolved field as still open", () => {
      expect(getResolvedDate("[oq:: Why?] [resolved:: ]")).toBeNull();
    });
  });
});

describe("scanOpenQuestions", () => {
  it("finds every question with the line it sits on", () => {
    const content = [
      "# Kohtari rollout",
      "",
      "[oq:: Is the date fixed?]",
      "Some prose.",
      "- [ ] Ship the rig",
      "[oq:: Who signs it off?] [resolved:: 2025-01-01]",
    ].join("\n");

    const questions = scanOpenQuestions(content, NOTE);

    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      question: "Is the date fixed?",
      line: 2,
    });
    expect(questions[1]).toMatchObject({
      question: "Who signs it off?",
      line: 5,
      resolved: true,
    });
  });

  it("finds nothing in a note that holds none", () => {
    expect(scanOpenQuestions("Just some notes.\n", NOTE)).toEqual([]);
  });
});

describe("writeResolvedToLine", () => {
  it("marks an open question answered", () => {
    expect(writeResolvedToLine("[oq:: Is it fixed?]", "2025-01-01")).toBe(
      "[oq:: Is it fixed?] [resolved:: 2025-01-01]"
    );
  });

  it("reopens an answered question", () => {
    expect(
      writeResolvedToLine("[oq:: Is it fixed?] [resolved:: 2025-01-01]", null)
    ).toBe("[oq:: Is it fixed?]");
  });

  it("replaces an existing date rather than adding a second", () => {
    expect(
      writeResolvedToLine(
        "[oq:: Is it fixed?] [resolved:: 2025-01-01]",
        "2025-02-02"
      )
    ).toBe("[oq:: Is it fixed?] [resolved:: 2025-02-02]");
  });

  it("clears every accepted spelling, so a line cannot contradict itself", () => {
    expect(
      writeResolvedToLine(
        "[oq:: Is it fixed?] (answered:: 2025-01-01)",
        "2025-02-02"
      )
    ).toBe("[oq:: Is it fixed?] [resolved:: 2025-02-02]");
  });

  it("leaves the prose around the question alone", () => {
    expect(
      writeResolvedToLine("Context first. [oq:: Why?] and after.", "2025-01-01")
    ).toBe("Context first. [oq:: Why?] and after. [resolved:: 2025-01-01]");
  });

  it("round-trips a line back to exactly what it was", () => {
    const original = "[oq:: Is it fixed?]";
    const marked = writeResolvedToLine(original, "2025-01-01");

    expect(writeResolvedToLine(marked, null)).toBe(original);
  });

  it("keeps the indentation a list item was written with", () => {
    expect(writeResolvedToLine("  - [oq:: Why?]", "2025-01-01")).toBe(
      "  - [oq:: Why?] [resolved:: 2025-01-01]"
    );
  });
});

describe("openQuestionMarker", () => {
  it("writes the canonical spelling", () => {
    expect(openQuestionMarker()).toBe("[oq:: ]");
  });

  it("wraps the words already selected", () => {
    expect(openQuestionMarker("  Is it fixed?  ")).toBe("[oq:: Is it fixed?]");
  });

  it("leaves the cursor inside the brackets", () => {
    const marker = openQuestionMarker();
    expect(marker[openQuestionMarkerCursor()]).toBe("]");
  });

  it("writes a marker that reads back as the question it wrapped", () => {
    const marker = openQuestionMarker("Is it fixed?");
    expect(parseOpenQuestionLine(marker, NOTE, 0)?.question).toBe(
      "Is it fixed?"
    );
  });
});

describe("noteNameOf", () => {
  it.each([
    ["Projects/Kohtari rollout.md", "Kohtari rollout"],
    ["Inbox.md", "Inbox"],
    ["a/b/c/Deep note.md", "Deep note"],
  ])("reads %s as %s", (path, expected) => {
    expect(noteNameOf(path)).toBe(expected);
  });
});

describe("sortOpenQuestions", () => {
  it("orders by note, then down the note", () => {
    const questions = [
      makeQuestion({ notePath: "b.md", line: 1 }),
      makeQuestion({ notePath: "a.md", line: 9 }),
      makeQuestion({ notePath: "a.md", line: 2 }),
    ];

    expect(
      sortOpenQuestions(questions).map((q) => `${q.notePath}:${q.line}`)
    ).toEqual(["a.md:2", "a.md:9", "b.md:1"]);
  });

  it("leaves the list it was given untouched", () => {
    const questions = [
      makeQuestion({ notePath: "b.md" }),
      makeQuestion({ notePath: "a.md" }),
    ];

    sortOpenQuestions(questions);

    expect(questions[0].notePath).toBe("b.md");
  });
});

describe("matchesQuery", () => {
  const question = makeQuestion();

  it.each(["", "  ", "rollout", "ROLLOUT", "fixed", "date"])(
    "matches on %s",
    (query) => {
      expect(matchesQuery(question, query)).toBe(true);
    }
  );

  it("does not match on words it does not hold", () => {
    expect(matchesQuery(question, "finance")).toBe(false);
  });
});

describe("parseAnswerBlock", () => {
  it("reads a one-line answer under its question", () => {
    const lines = [
      "[oq:: Is it fixed?]",
      "> [!answer] Fixed, confirmed by Ops",
    ];

    expect(parseAnswerBlock(lines, 0)).toEqual({
      answer: "Fixed, confirmed by Ops",
      endLine: 1,
    });
  });

  it("reads an answer that runs over several lines", () => {
    const lines = [
      "[oq:: Is it fixed?]",
      "> [!answer] Fixed.",
      "> Confirmed 12 March by Ops.",
      "> The recert is the only risk.",
      "",
      "Prose that is not the answer.",
    ];

    expect(parseAnswerBlock(lines, 0)).toEqual({
      answer:
        "Fixed.\nConfirmed 12 March by Ops.\nThe recert is the only risk.",
      endLine: 3,
    });
  });

  it("reads an answer written with no space after the marker", () => {
    const lines = ["[oq:: Why?]", ">[!answer]Because."];
    expect(parseAnswerBlock(lines, 0)?.answer).toBe("Because.");
  });

  it("reads an indented answer under an indented question", () => {
    const lines = ["  - [oq:: Why?]", "  > [!answer] Because."];
    expect(parseAnswerBlock(lines, 0)?.answer).toBe("Because.");
  });

  it.each([
    ["nothing follows the question", ["[oq:: Why?]"]],
    ["a blank line separates them", ["[oq:: Why?]", "", "> [!answer] Late."]],
    ["the next line is prose", ["[oq:: Why?]", "Just a sentence."]],
    ["the next line is another callout", ["[oq:: Why?]", "> [!note] Not it."]],
  ])("finds no answer when %s", (_case, lines) => {
    expect(parseAnswerBlock(lines, 0)).toBeNull();
  });

  it("stops at a different callout rather than swallowing it", () => {
    const lines = [
      "[oq:: Why?]",
      "> [!answer] Because.",
      "> [!warning] A separate callout.",
    ];

    expect(parseAnswerBlock(lines, 0)).toEqual({
      answer: "Because.",
      endLine: 1,
    });
  });

  it("is found by the parser, so a question knows its own answer", () => {
    const lines = ["[oq:: Why?]", "> [!answer] Because."];
    const question = parseOpenQuestionLine(lines[0], NOTE, 0, lines);

    expect(question?.answer).toBe("Because.");
    expect(question?.answerEndLine).toBe(1);
  });

  it("leaves an empty callout reading as no answer at all", () => {
    const lines = ["[oq:: Why?]", "> [!answer]"];
    expect(parseOpenQuestionLine(lines[0], NOTE, 0, lines)?.answer).toBeNull();
  });
});

describe("answerBlockLines", () => {
  it("writes a one-line answer as a callout", () => {
    expect(answerBlockLines("Because.", "")).toEqual(["> [!answer] Because."]);
  });

  it("carries every line of a longer answer", () => {
    expect(answerBlockLines("First.\nSecond.", "")).toEqual([
      "> [!answer] First.",
      "> Second.",
    ]);
  });

  it("indents to match the question it belongs to", () => {
    expect(answerBlockLines("Because.", "  ")).toEqual([
      "  > [!answer] Because.",
    ]);
  });

  it("leaves no trailing space on a blank line inside an answer", () => {
    expect(answerBlockLines("First.\n\nThird.", "")).toEqual([
      "> [!answer] First.",
      ">",
      "> Third.",
    ]);
  });
});

describe("writeAnswerToLines", () => {
  it("adds an answer where there was none", () => {
    const lines = ["# Note", "[oq:: Why?]", "Prose after."];

    expect(writeAnswerToLines(lines, 1, "Because.")).toEqual([
      "# Note",
      "[oq:: Why?]",
      "> [!answer] Because.",
      "Prose after.",
    ]);
  });

  it("replaces an answer rather than stacking a second one", () => {
    const lines = [
      "[oq:: Why?]",
      "> [!answer] An old answer.",
      "> Still the old one.",
      "Prose after.",
    ];

    expect(writeAnswerToLines(lines, 0, "A new answer.")).toEqual([
      "[oq:: Why?]",
      "> [!answer] A new answer.",
      "Prose after.",
    ]);
  });

  it("takes an answer away when it is cleared", () => {
    const lines = ["[oq:: Why?]", "> [!answer] Because.", "Prose after."];

    expect(writeAnswerToLines(lines, 0, null)).toEqual([
      "[oq:: Why?]",
      "Prose after.",
    ]);
  });

  it.each([null, "", "   "])("treats %p as no answer", (answer) => {
    const lines = ["[oq:: Why?]", "> [!answer] Because."];
    expect(writeAnswerToLines(lines, 0, answer)).toEqual(["[oq:: Why?]"]);
  });

  it("leaves prose that merely follows the question alone", () => {
    const lines = ["[oq:: Why?]", "A paragraph I wrote myself."];

    expect(writeAnswerToLines(lines, 0, "Because.")).toEqual([
      "[oq:: Why?]",
      "> [!answer] Because.",
      "A paragraph I wrote myself.",
    ]);
  });

  it("leaves a second question further down untouched", () => {
    const lines = ["[oq:: First?]", "", "[oq:: Second?]"];

    expect(writeAnswerToLines(lines, 0, "Because.")).toEqual([
      "[oq:: First?]",
      "> [!answer] Because.",
      "",
      "[oq:: Second?]",
    ]);
  });

  it("round-trips: what is written is what is read back", () => {
    const written = writeAnswerToLines(
      ["[oq:: Why?]"],
      0,
      "Because.\nAnd also this."
    );

    expect(parseAnswerBlock(written, 0)?.answer).toBe(
      "Because.\nAnd also this."
    );
  });
});

describe("edge cases", () => {
  it("reads a question containing a colon", () => {
    expect(
      parseOpenQuestionLine("[oq:: Rollout: is the date fixed?]", NOTE, 0)
        ?.question
    ).toBe("Rollout: is the date fixed?");
  });

  it("reads only the first question on a line", () => {
    const line = "[oq:: First?] [oq:: Second?]";
    expect(parseOpenQuestionLine(line, NOTE, 0)?.question).toBe("First?");
  });

  it("survives a note whose only content is a newline", () => {
    expect(scanOpenQuestions("\n", NOTE)).toEqual([]);
  });

  it("keeps a question that has no closing bracket out", () => {
    expect(parseOpenQuestionLine("[oq:: unterminated", NOTE, 0)).toBeNull();
  });
});
