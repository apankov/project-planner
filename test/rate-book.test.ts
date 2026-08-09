import {
  EMPTY_RATE_BOOK,
  knownPeople,
  normalizePersonKey,
  parseRateBook,
  resolveRate,
} from "../src/lib/rate-book";

const NOTE = `# Rates

| Grade      | Rate |
| ---------- | ---- |
| Principal  | 145  |
| Senior     | 110  |
| Engineer   | 85   |

# People

| Person      | Grade     | Rate |
| ----------- | --------- | ---- |
| Alice Smith | Principal |      |
| Bob Jones   | Engineer  |      |
| Cara Diaz   | Senior    | 130  |
`;

describe("parseRateBook", () => {
  it("reads both tables", () => {
    const book = parseRateBook(NOTE);

    expect(book.grades).toEqual([
      { name: "Principal", rate: 145 },
      { name: "Senior", rate: 110 },
      { name: "Engineer", rate: 85 },
    ]);
    expect(book.people).toEqual([
      { name: "Alice Smith", grade: "Principal", rateOverride: null },
      { name: "Bob Jones", grade: "Engineer", rateOverride: null },
      { name: "Cara Diaz", grade: "Senior", rateOverride: 130 },
    ]);
    expect(book.problems).toEqual([]);
  });

  it("finds the tables in either order", () => {
    const reversed = `| Person | Grade |
| --- | --- |
| Alice | Engineer |

| Grade | Rate |
| --- | --- |
| Engineer | 85 |
`;
    const book = parseRateBook(reversed);

    expect(book.grades).toHaveLength(1);
    expect(book.people).toHaveLength(1);
    expect(book.problems).toEqual([]);
  });

  it("does not read the people table as the rates table", () => {
    const book = parseRateBook(NOTE);

    expect(book.grades.map((g) => g.name)).not.toContain("Alice Smith");
  });

  it("ignores an unrelated table", () => {
    const book = parseRateBook(`| Project | Status |
| --- | --- |
| Loom | Active |

${NOTE}`);

    expect(book.grades).toHaveLength(3);
    expect(book.people).toHaveLength(3);
    expect(book.problems).toEqual([]);
  });

  it("merges two tables of the same kind", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |

| Person | Grade |
| --- | --- |
| Alice | Engineer |

| Person | Grade |
| --- | --- |
| Bob | Engineer |
`);

    expect(knownPeople(book)).toEqual(["Alice", "Bob"]);
  });

  it("accepts alignment colons in the separator", () => {
    const book = parseRateBook(`| Grade | Rate |
|:------|-----:|
| Engineer | 85 |
`);

    expect(book.grades).toEqual([{ name: "Engineer", rate: 85 }]);
  });

  it.each([
    ["Rate", 85],
    ["Chargeout", 85],
    ["Chargeout rate", 85],
    ["Hourly rate", 85],
  ])("accepts %s as the rate column", (header, rate) => {
    const book = parseRateBook(`| Grade | ${header} |
| --- | --- |
| Engineer | 85 |
`);

    expect(book.grades).toEqual([{ name: "Engineer", rate }]);
  });

  it.each(["Person", "Name", "People", "Who", "Resource"])(
    "accepts %s as the person column",
    (header) => {
      const book = parseRateBook(`| ${header} | Grade |
| --- | --- |
| Alice | Engineer |
`);

      expect(knownPeople(book)).toEqual(["Alice"]);
    }
  );

  it("strips a currency symbol and thousands separator from a rate", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Principal | £1,450.50 |
`);

    expect(book.grades).toEqual([{ name: "Principal", rate: 1450.5 }]);
  });

  it("reports a missing rates table", () => {
    const book = parseRateBook(`| Person | Grade |
| --- | --- |
| Alice | Engineer |
`);

    expect(book.problems).toContainEqual({
      line: 0,
      text: "",
      reason: "no-rate-table",
    });
  });

  it("reports a missing people table", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |
`);

    expect(book.problems).toContainEqual({
      line: 0,
      text: "",
      reason: "no-people-table",
    });
  });

  it("reports an empty note as missing both", () => {
    expect(parseRateBook("").problems.map((p) => p.reason)).toEqual([
      "no-rate-table",
      "no-people-table",
    ]);
  });

  it("drops a grade whose rate will not parse, and says which line", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Principal | ask Bob |
| Engineer | 85 |
`);

    expect(book.grades).toEqual([{ name: "Engineer", rate: 85 }]);
    expect(book.problems).toContainEqual({
      line: 3,
      text: "| Principal | ask Bob |",
      reason: "bad-rate",
    });
  });

  it("keeps the first of two grades with the same name", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |
| engineer | 999 |
`);

    expect(book.grades).toEqual([{ name: "Engineer", rate: 85 }]);
    expect(book.problems).toContainEqual({
      line: 4,
      text: "| engineer | 999 |",
      reason: "duplicate-grade",
    });
  });

  it("keeps the first of two people with the same name", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |

| Person | Grade |
| --- | --- |
| Alice Smith | Engineer |
| alice  smith | Engineer |
`);

    expect(knownPeople(book)).toEqual(["Alice Smith"]);
    expect(book.problems.map((p) => p.reason)).toContain("duplicate-person");
  });

  it("keeps a person on an unknown grade but reports them", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |

| Person | Grade |
| --- | --- |
| Alice | Archmage |
`);

    expect(knownPeople(book)).toEqual(["Alice"]);
    expect(book.problems).toContainEqual({
      line: 0,
      text: "Alice",
      reason: "unknown-grade",
    });
  });

  it("does not report an unknown grade when the person has their own rate", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Engineer | 85 |

| Person | Grade | Rate |
| --- | --- | --- |
| Alice | Archmage | 200 |
`);

    expect(book.problems.map((p) => p.reason)).not.toContain("unknown-grade");
  });

  it("skips a blank name row without complaining", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| | |
| Engineer | 85 |
`);

    expect(book.grades).toEqual([{ name: "Engineer", rate: 85 }]);
    expect(book.problems.map((p) => p.reason)).not.toContain("bad-rate");
  });

  it("ignores a pipe line that is not followed by a separator", () => {
    const book = parseRateBook(`| not | a | table |

${NOTE}`);

    expect(book.problems).toEqual([]);
  });

  it("handles an escaped pipe inside a cell", () => {
    const book = parseRateBook(`| Grade | Rate |
| --- | --- |
| Contract \\| Agency | 95 |
`);

    expect(book.grades).toEqual([{ name: "Contract | Agency", rate: 95 }]);
  });
});

describe("resolveRate", () => {
  const book = parseRateBook(NOTE);

  it("uses the grade's rate", () => {
    expect(resolveRate(book, "Alice Smith")).toEqual({
      rate: 145,
      source: "grade",
      grade: "Principal",
    });
  });

  it("prefers a rate on the person", () => {
    expect(resolveRate(book, "Cara Diaz")).toEqual({
      rate: 130,
      source: "person",
      grade: "Senior",
    });
  });

  it.each(["alice smith", "Alice  Smith", "[[Alice Smith]]", " Alice Smith "])(
    "matches %s to the same person",
    (name) => {
      expect(resolveRate(book, name).rate).toBe(145);
    }
  );

  it("returns nothing for someone the book does not know", () => {
    expect(resolveRate(book, "Nobody")).toEqual({
      rate: null,
      source: "unknown",
      grade: null,
    });
  });

  it("returns nothing, but keeps the grade, when the grade has no rate", () => {
    const orphan = parseRateBook(`| Person | Grade |
| --- | --- |
| Alice | Archmage |
`);

    expect(resolveRate(orphan, "Alice")).toEqual({
      rate: null,
      source: "unknown",
      grade: "Archmage",
    });
  });

  it("returns nothing for an empty book", () => {
    expect(resolveRate(EMPTY_RATE_BOOK, "Alice").source).toBe("unknown");
  });

  it("returns nothing for an empty name", () => {
    expect(resolveRate(book, "  ").source).toBe("unknown");
  });
});

describe("normalizePersonKey", () => {
  it.each([
    ["Alice Smith", "alice smith"],
    ["  Alice   Smith ", "alice smith"],
    ["[[Alice Smith]]", "alice smith"],
    ["[[People/Alice|Alice Smith]]", "alice smith"],
    ["[[People/Alice]]", "alice"],
  ])("reduces %s to %s", (input, expected) => {
    expect(normalizePersonKey(input)).toBe(expected);
  });
});
