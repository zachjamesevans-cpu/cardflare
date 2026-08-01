import { describe, expect, it } from "vitest";

import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  displayNameSchema,
} from "@/lib/players/schema";

const parse = (value: string) => displayNameSchema.safeParse(value);

describe("displayNameSchema", () => {
  it("accepts an ordinary name", () => {
    expect(parse("Zach").data).toBe("Zach");
  });

  it("trims surrounding whitespace", () => {
    expect(parse("   Zach   ").data).toBe("Zach");
  });

  /*
   * A name is rendered beside other players' names. Runs of spaces would let
   * one entry push the others off the row, so they collapse before length is
   * measured rather than counting toward it.
   */
  it("collapses internal whitespace", () => {
    expect(parse("Zach          E").data).toBe("Zach E");
  });

  it("counts the collapsed length, not the typed length", () => {
    const spaced = `Za${" ".repeat(40)}ch`;

    expect(parse(spaced).success).toBe(true);
    expect(parse(spaced).data).toBe("Za ch");
  });

  it("rejects a name shorter than the minimum", () => {
    expect(parse("Z").success).toBe(false);
    expect(parse("Z".repeat(DISPLAY_NAME_MIN)).success).toBe(true);
  });

  it("rejects a name longer than the maximum", () => {
    expect(parse("x".repeat(DISPLAY_NAME_MAX)).success).toBe(true);
    expect(parse("x".repeat(DISPLAY_NAME_MAX + 1)).success).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    for (const value of ["", "   ", "\t\n"]) {
      expect(parse(value).success).toBe(false);
    }
  });

  /*
   * Whitespace-like characters are normalised rather than refused — including
   * U+FEFF, which JavaScript's `\s` matches. Someone who pastes a name out of
   * a spreadsheet gets a tidy name, not a rejection.
   */
  it("normalises whitespace control characters into a space", () => {
    expect(parse("Bad\nName").data).toBe("Bad Name");
    expect(parse("Bad\tName").data).toBe("Bad Name");
    expect(parse("Bad\uFEFFName").data).toBe("Bad Name");
  });

  it("rejects control characters that are not whitespace", () => {
    for (const value of ["Bad\u0000Name", "Bad\u0007Name", "Bad\u001BName"]) {
      expect(parse(value).success).toBe(false);
    }
  });

  /*
   * A bidi override makes a name render as something other than what is
   * stored, which is impersonation rather than untidiness. A zero-width space
   * lets two players hold names that look identical to everyone in the room.
   */
  it("rejects bidi overrides and zero-width characters", () => {
    for (const value of [
      "Bad\u202EName",
      "Bad\u200BName",
      "Bad\u2066Name",
      "Bad\u200FName",
    ]) {
      expect(parse(value).success).toBe(false);
    }
  });

  it("accepts non-Latin scripts", () => {
    for (const value of ["ゾロ", "Łukasz", "Зак"]) {
      expect(parse(value).success).toBe(true);
    }
  });

  /*
   * Emoji sequences are joined by U+200D, which sits in the same Unicode
   * category as the bidi controls above. Rejecting that category wholesale
   * would quietly ban most flag and profession emoji.
   */
  it("accepts emoji, including joined sequences", () => {
    for (const value of ["Zach \u{1F525}", "\u{1F3F4}‍☠️ Zach"]) {
      expect(parse(value).success).toBe(true);
    }
  });

  it("explains what is wrong without echoing the input", () => {
    const result = parse("Z");

    expect(result.error?.issues[0]?.message).toMatch(/at least 2/i);
    expect(result.error?.issues[0]?.message).not.toContain("Z");
  });
});
