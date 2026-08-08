import { parseRateBook } from "../src/lib/rate-book";
import {
  DEFAULT_RATE_NOTE_PATH,
  rateNoteTemplate,
  resolveRateNotePath,
} from "../src/lib/rate-book-note";

describe("resolveRateNotePath", () => {
  it.each([
    ["", DEFAULT_RATE_NOTE_PATH],
    ["   ", DEFAULT_RATE_NOTE_PATH],
    ["Finance/Rates", "Finance/Rates.md"],
    ["Finance/Rates.md", "Finance/Rates.md"],
    ["Rates.MD", "Rates.MD"],
    ["  Finance/Rates  ", "Finance/Rates.md"],
  ])("turns %p into %p", (input, expected) => {
    expect(resolveRateNotePath(input)).toBe(expected);
  });
});

describe("rateNoteTemplate", () => {
  const book = parseRateBook(rateNoteTemplate());

  it("parses without problems", () => {
    expect(book.problems).toEqual([]);
  });

  it("comes with example grades", () => {
    expect(book.grades).toEqual([
      { name: "Principal", rate: 145 },
      { name: "Senior", rate: 110 },
      { name: "Engineer", rate: 85 },
      { name: "Apprentice", rate: 40 },
    ]);
  });

  it("leaves the people table empty for the user to fill in", () => {
    expect(book.people).toEqual([]);
  });
});
