import { describe, expect, it } from "vitest";

import { parseCardQuery } from "@/lib/cards/query";

/**
 * Reading filters out of what somebody typed.
 *
 * The rule that matters most is not "does it find the filter" but "does
 * it ever make a search worse". Every case below where nothing sensible
 * is left to search for has to hand back exactly what was typed.
 */

describe("parseCardQuery", () => {
  it("lifts a card type out and keeps the name", () => {
    const parsed = parseCardQuery("luffy leader");

    expect(parsed.text).toBe("luffy");
    expect(parsed.filters.cardType).toBe("leader");
    expect(parsed.narrowed).toBe(true);
  });

  it("reads the words in any order", () => {
    expect(parseCardQuery("leader luffy").text).toBe("luffy");
    expect(parseCardQuery("leader luffy").filters.cardType).toBe("leader");
  });

  it("takes a colour, a type and a set code together", () => {
    const parsed = parseCardQuery("red leader op01 luffy");

    expect(parsed.text).toBe("luffy");
    expect(parsed.filters).toEqual({
      cardType: "leader",
      color: "red",
      setCode: "OP01",
    });
  });

  it("is not case sensitive, and upper-cases the set code for the catalog", () => {
    const parsed = parseCardQuery("Luffy LEADER Op01");

    expect(parsed.text).toBe("Luffy");
    expect(parsed.filters.cardType).toBe("leader");
    expect(parsed.filters.setCode).toBe("OP01");
  });

  /* The name is handed back as typed: the search highlights the match,
     and lower-casing it would highlight the wrong characters. */
  it("keeps the name's own capitalisation", () => {
    expect(parseCardQuery("Nami character").text).toBe("Nami");
  });

  /* -------------------------------------------------------------- */
  /* The cases that must never narrow                               */
  /* -------------------------------------------------------------- */

  it("leaves a single word alone, even when it is a card type", () => {
    const parsed = parseCardQuery("leader");

    expect(parsed.text).toBe("leader");
    expect(parsed.narrowed).toBe(false);
    expect(parsed.filters.cardType).toBeNull();
  });

  it("leaves a query that is nothing but filters alone", () => {
    const parsed = parseCardQuery("red leader");

    expect(parsed.text).toBe("red leader");
    expect(parsed.narrowed).toBe(false);
    expect(parsed.filters).toEqual({ cardType: null, color: null, setCode: null });
  });

  it("does not touch a query with no keywords in it", () => {
    const parsed = parseCardQuery("monkey d luffy");

    expect(parsed.text).toBe("monkey d luffy");
    expect(parsed.narrowed).toBe(false);
  });

  /*
   * A card number is not a set code. "OP01-024" has to reach the search
   * intact, because the compact-number match is what finds it exactly.
   */
  it("leaves a card number in the text", () => {
    const parsed = parseCardQuery("op01-024 luffy");

    expect(parsed.text).toBe("op01-024 luffy");
    expect(parsed.filters.setCode).toBeNull();
  });

  /* Two colours cannot both apply, so the second stays a search word
     rather than being silently thrown away. */
  it("uses the first of each kind and leaves the rest as text", () => {
    const parsed = parseCardQuery("red blue luffy");

    expect(parsed.filters.color).toBe("red");
    expect(parsed.text).toBe("blue luffy");
  });

  it("survives extra whitespace", () => {
    const parsed = parseCardQuery("  luffy   leader  ");

    expect(parsed.text).toBe("luffy");
    expect(parsed.filters.cardType).toBe("leader");
  });

  it("returns something usable for an empty query", () => {
    expect(parseCardQuery("")).toEqual({
      text: "",
      filters: { cardType: null, color: null, setCode: null },
      narrowed: false,
    });
  });
});
