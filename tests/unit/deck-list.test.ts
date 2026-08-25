import { describe, expect, it } from "vitest";

import {
  DECK_LINE_MAX_QUANTITY as appDeckLineMaxQuantity,
  DECK_LIST_MAX as appDeckListMax,
  parseDeckLine as appParseDeckLine,
  parseDeckList as appParseDeckList,
} from "../../mobile/src/deck-list";

import {
  compactCardNumber,
  DECK_LINE_MAX_QUANTITY,
  DECK_LIST_MAX,
  parseDeckLine,
  parseDeckList,
} from "@/lib/players/deck-list";

/**
 * A pasted deck list.
 *
 * The point of pasting is not having to reformat first, so the parser
 * has to take what deck builders actually emit rather than one blessed
 * shape. Every case below is a format somebody's export really uses, and
 * a parser that quietly drops a line costs a player a card they thought
 * they had posted — silent, and only discovered at a counter.
 */

describe("parseDeckLine", () => {
  it.each([
    ["OP17-001", "OP17-001", 1],
    ["4x OP17-001", "OP17-001", 4],
    ["4 OP17-001", "OP17-001", 4],
    ["OP17-001 x4", "OP17-001", 4],
    ["OP17-001 4", "OP17-001", 4],
    ["4x OP17-001 Monkey D. Luffy", "OP17-001", 4],
    ["1x ST01-001 Leader", "ST01-001", 1],
    ["  2x   OP17-013  ", "OP17-013", 2],
    ["op17-001", "OP17-001", 1],
    /* The count glued straight onto the number — the simulator's and
       the deck sites' export, and the founder's bug report: the x read
       as the set code's first letter, "XOP14-020" matched nothing, and
       a whole paste came back unknown. */
    ["1xOP14-020", "OP14-020", 1],
    ["4xST32-002", "ST32-002", 4],
    ["2xST24-004", "ST24-004", 2],
    ["10xOP17-001", "OP17-001", 10],
    ["4XOP07-022", "OP07-022", 4],
  ])("reads %j", (line, cardNumber, quantity) => {
    expect(parseDeckLine(line)).toEqual({ cardNumber, quantity });
  });

  it("reads the founder's simulator paste, every line", () => {
    const pasted = [
      "1xOP14-020",
      "2xST24-004",
      "4xOP13-031",
      "4xST32-002",
      "4xOP12-034",
      "4xST32-001",
      "4xOP07-022",
      "4xOP12-023",
      "4xOP06-038",
      "2xOP13-040",
      "1xOP12-037",
      "3xOP01-055",
      "1xOP14-039",
      "1xST30-011",
      "4xOP06-033",
      "4xOP17-031",
      "4xOP17-022",
    ].join("\n");

    const { lines, unreadable } = parseDeckList(pasted);
    expect(unreadable).toEqual([]);
    expect(lines).toHaveLength(17);
    expect(lines[0]).toEqual({ cardNumber: "OP14-020", quantity: 1 });
    expect(lines.at(-1)).toEqual({ cardNumber: "OP17-022", quantity: 4 });
    /* Not one line may come back wearing the x. */
    for (const line of lines) expect(line.cardNumber).toMatch(/^(OP|ST)\d{2}-\d{3}$/);
  });

  it("does not read a card's own digits as a quantity", () => {
    /* The trap in this parser. "OP17-001" contains numbers on both
       sides of the identifier, and a loose regex reads 17 of them. */
    expect(parseDeckLine("OP17-001")).toEqual({ cardNumber: "OP17-001", quantity: 1 });
    expect(parseDeckLine("OP01-025")).toEqual({ cardNumber: "OP01-025", quantity: 1 });
  });

  it.each(["", "   ", "# Leaders", "// main deck", "Just some words"])(
    "ignores %j",
    (line) => {
      expect(parseDeckLine(line)).toBeNull();
    },
  );

  it("caps a silly quantity rather than trusting it", () => {
    expect(parseDeckLine("99x OP17-001")?.quantity).toBe(DECK_LINE_MAX_QUANTITY);
  });
});

describe("parseDeckList", () => {
  it("reads a list a builder would export", () => {
    const { lines, unreadable } = parseDeckList(
      [
        "# Leader",
        "1x OP17-001 Edward.Newgate",
        "",
        "# Deck",
        "4x OP17-005",
        "2 OP17-013",
      ].join("\n"),
    );

    expect(lines).toEqual([
      { cardNumber: "OP17-001", quantity: 1 },
      { cardNumber: "OP17-005", quantity: 4 },
      { cardNumber: "OP17-013", quantity: 2 },
    ]);
    expect(unreadable).toEqual([]);
  });

  it("sums a card listed twice rather than keeping two entries", () => {
    /* Builders split a card across sections. Two lines of two means
       four of it, and two want rows for one card is not a thing. */
    const { lines } = parseDeckList("2x OP17-001\n2x OP17-001");
    expect(lines).toEqual([{ cardNumber: "OP17-001", quantity: 4 }]);
  });

  it("keeps the order they were pasted in", () => {
    const { lines } = parseDeckList("OP17-013\nOP17-001\nOP17-005");
    expect(lines.map((line) => line.cardNumber)).toEqual([
      "OP17-013",
      "OP17-001",
      "OP17-005",
    ]);
  });

  it("hands back the lines it could not read, so they can be shown", () => {
    const { lines, unreadable } = parseDeckList("4x OP17-001\nsome nonsense here");
    expect(lines).toHaveLength(1);
    expect(unreadable).toEqual(["some nonsense here"]);
  });

  it("does not report a comment as unreadable", () => {
    /* A section header is not a mistake, and reporting it as one would
       make every real export look half-broken. */
    const { unreadable } = parseDeckList("# Leader\n// notes\n4x OP17-001");
    expect(unreadable).toEqual([]);
  });

  it("stops at the cap rather than accepting a pasted novel", () => {
    const many = Array.from(
      { length: DECK_LIST_MAX + 40 },
      (_, i) => `OP17-${String(i + 1).padStart(3, "0")}`,
    ).join("\n");

    expect(parseDeckList(many).lines).toHaveLength(DECK_LIST_MAX);
  });

  it("reads an empty paste as nothing rather than throwing", () => {
    expect(parseDeckList("")).toEqual({ lines: [], unreadable: [] });
  });
});

describe("compactCardNumber", () => {
  it("matches a list written with or without the dash", () => {
    /* Deck builders disagree about the dash, and a player pasting one
       should never have to care which theirs uses. */
    expect(compactCardNumber("OP17-001")).toBe(compactCardNumber("OP17001"));
    expect(compactCardNumber("op17-001")).toBe("OP17001");
  });
});

/**
 * The app parses a pasted list too, and its copy is imported here.
 *
 * A phone reading "4x OP17-001" differently from the website would post
 * a different deck from the same paste, on the platform the founder
 * tests least. The file is deliberately free of React Native imports so
 * this costs nothing.
 */
describe("the app parses a deck list the same way", () => {
  const CASES = [
    "OP17-001",
    "4x OP17-001",
    "4 OP17-001",
    "OP17-001 x4",
    "4x OP17-001 Monkey D. Luffy",
    "op17-001",
    "99x OP17-001",
    "1xOP14-020",
    "4XST32-002",
    "# Leader",
    "nothing here",
  ];

  it.each(CASES)("agrees on %j", (line) => {
    expect(appParseDeckLine(line)).toEqual(parseDeckLine(line));
  });

  it("agrees on a whole list, sums and order included", () => {
    const list = "# Leader\n1x OP17-001\n\n2x OP17-005\n2x OP17-005\nnonsense";
    expect(appParseDeckList(list)).toEqual(parseDeckList(list));
  });

  it("shares the same caps", () => {
    expect(appDeckListMax).toBe(DECK_LIST_MAX);
    expect(appDeckLineMaxQuantity).toBe(DECK_LINE_MAX_QUANTITY);
  });
});
