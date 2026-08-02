import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";
import { highlightParts, printingLabel } from "@/lib/cards/schema";

const searchCards = vi.fn();
const countCards = vi.fn();
let requestHeaders: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

vi.mock("@/lib/cards/search", () => ({
  SEARCH_LIMIT: 20,
  searchCards: (...args: unknown[]) => searchCards(...args),
  countCards: () => countCards(),
}));

const { searchCardsAction } = await import("@/lib/cards/actions");

const hit = {
  id: "1",
  exactName: "Monkey D. Luffy",
  canonicalCardNumber: "OP01-024",
};

beforeEach(() => {
  resetRateLimits();
  searchCards.mockReset().mockResolvedValue([]);
  countCards.mockReset().mockResolvedValue(2451);
  requestHeaders = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("searchCardsAction", () => {
  it("searches by exact name", async () => {
    searchCards.mockResolvedValue([hit]);

    const result = await searchCardsAction("Monkey D. Luffy");

    expect(result).toMatchObject({ status: "ok", poolEmpty: false });
    expect(searchCards).toHaveBeenCalledWith("Monkey D. Luffy", expect.anything());
  });

  it("searches by partial name", async () => {
    searchCards.mockResolvedValue([hit]);

    expect((await searchCardsAction("luffy")).status).toBe("ok");
    expect(searchCards).toHaveBeenCalledWith("luffy", expect.anything());
  });

  it("searches by card number, with or without the dash", async () => {
    await searchCardsAction("OP01-024");
    await searchCardsAction("op01024");

    expect(searchCards).toHaveBeenNthCalledWith(1, "OP01-024", expect.anything());
    expect(searchCards).toHaveBeenNthCalledWith(2, "op01024", expect.anything());
  });

  it("collapses whitespace before searching", async () => {
    await searchCardsAction("  monkey   d   luffy  ");

    expect(searchCards).toHaveBeenCalledWith("monkey d luffy", expect.anything());
  });

  it("passes filters through as nulls when absent", async () => {
    await searchCardsAction("luffy");

    expect(searchCards).toHaveBeenCalledWith("luffy", {
      setCode: null,
      cardType: null,
      color: null,
    });
  });

  it("passes supplied filters through", async () => {
    await searchCardsAction("luffy", { setCode: "OP01", color: "red" });

    expect(searchCards).toHaveBeenCalledWith("luffy", {
      setCode: "OP01",
      cardType: null,
      color: "red",
    });
  });

  /*
   * No match is an answer, not a failure. Reporting it as an error would make
   * a correct "that card does not exist" look like the app is broken.
   */
  it("treats no matches as a result", async () => {
    expect(await searchCardsAction("zzzzqqqq")).toMatchObject({
      status: "ok",
      poolEmpty: false,
    });
  });

  /*
   * "Nothing matched" and "nothing is loaded" are the same screen to a player
   * and completely different problems. Only the second is a setup task.
   */
  it("distinguishes an empty catalog from a query that matched nothing", async () => {
    countCards.mockResolvedValue(0);

    expect(await searchCardsAction("luffy")).toMatchObject({ poolEmpty: true });
  });

  it("does not count the catalog when the search found something", async () => {
    searchCards.mockResolvedValue([hit]);

    await searchCardsAction("luffy");

    expect(countCards).not.toHaveBeenCalled();
  });

  it("refuses a query below the minimum without querying", async () => {
    expect((await searchCardsAction("z")).status).toBe("invalid");
    expect((await searchCardsAction("  ")).status).toBe("invalid");
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses an over-long query", async () => {
    expect((await searchCardsAction("x".repeat(200))).status).toBe("invalid");
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("never leaks database internals when the search throws", async () => {
    searchCards.mockRejectedValue(new Error('relation "cards" does not exist'));

    const result = await searchCardsAction("luffy");

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).not.toMatch(/relation|cards/i);
  });

  it("throttles a flood from one address", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.20" };

    for (let i = 0; i < 120; i += 1) await searchCardsAction(`query ${i}`);
    expect(searchCards).toHaveBeenCalledTimes(120);

    expect((await searchCardsAction("one too many")).status).toBe("error");
    expect(searchCards).toHaveBeenCalledTimes(120);
  });
});

describe("printingLabel", () => {
  const base = {
    setCode: "OP01",
    setName: "Romance Dawn",
    printingLabel: "OP01",
    variantType: null,
    rarity: null,
    printingName: null,
    isPromo: null,
    imageUrl: null,
  };

  it("uses the provider's label", () => {
    expect(printingLabel(base)).toBe("OP01");
  });

  it("appends a variant only when the provider gave one", () => {
    expect(printingLabel({ ...base, variantType: "Alternate Art" })).toBe(
      "OP01 · Alternate Art",
    );
  });

  // Nothing to say beats an empty chip.
  it("returns null when there is nothing meaningful to show", () => {
    expect(printingLabel({ ...base, setCode: null, printingLabel: null })).toBeNull();
  });
});

describe("highlightParts", () => {
  it("splits around a case-insensitive match", () => {
    expect(highlightParts("Monkey D. Luffy", "luffy")).toEqual([
      { text: "Monkey D. ", match: false },
      { text: "Luffy", match: true },
    ]);
  });

  it("returns the whole string when the term is empty", () => {
    expect(highlightParts("Luffy", "")).toEqual([{ text: "Luffy", match: false }]);
  });

  /*
   * The term is user input. Treating it as a pattern would let a stray
   * bracket throw while someone is typing.
   */
  it("treats regex metacharacters as literal text", () => {
    for (const term of ["(", "[a-z]", "*", "\\"]) {
      expect(() => highlightParts("Monkey D. Luffy", term)).not.toThrow();
    }

    expect(highlightParts("Monkey D. Luffy", ".")).toContainEqual({
      text: ".",
      match: true,
    });
  });
});
