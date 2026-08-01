import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetRateLimits } from "@/lib/rate-limit";

const searchCards = vi.fn();
let requestHeaders: Record<string, string> = {};

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => requestHeaders[name.toLowerCase()] ?? null,
  }),
}));

vi.mock("@/lib/cards/search", () => ({
  SEARCH_LIMIT: 20,
  searchCards: (...args: unknown[]) => searchCards(...args),
}));

const { searchCardsAction } = await import("@/lib/cards/actions");
const { CARD_SEARCH_IDLE, MIN_QUERY_LENGTH } = await import("@/lib/cards/schema");

function formData(query?: string) {
  const data = new FormData();
  if (query !== undefined) data.set("query", query);
  return data;
}

const search = (data: FormData) => searchCardsAction(CARD_SEARCH_IDLE, data);

beforeEach(() => {
  resetRateLimits();
  searchCards.mockReset().mockResolvedValue([]);
  requestHeaders = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("searchCardsAction", () => {
  it("returns results for a valid query", async () => {
    searchCards.mockResolvedValue([{ id: "1", code: "OP01-024", name: "Luffy" }]);

    const result = await search(formData("luffy"));

    expect(result).toMatchObject({ status: "results", query: "luffy" });
    expect(result.status === "results" && result.results).toHaveLength(1);
  });

  it("collapses whitespace before searching", async () => {
    await search(formData("  monkey   d   luffy  "));

    expect(searchCards).toHaveBeenCalledWith("monkey d luffy");
  });

  /*
   * No match is an answer, not a failure. Reporting it as an error would make
   * a correct "that card does not exist" look like the app is broken.
   */
  it("treats no matches as a result, not an error", async () => {
    searchCards.mockResolvedValue([]);

    const result = await search(formData("zzzzqqqq"));

    expect(result.status).toBe("results");
  });

  it("refuses a query shorter than the minimum without querying", async () => {
    const result = await search(formData("z"));

    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toContain(
      String(MIN_QUERY_LENGTH),
    );
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses an empty or absent query without querying", async () => {
    expect((await search(formData(""))).status).toBe("error");
    expect((await search(formData("   "))).status).toBe("error");
    expect((await search(formData())).status).toBe("error");
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("refuses an over-long query", async () => {
    const result = await search(formData("x".repeat(200)));

    expect(result.status).toBe("error");
    expect(searchCards).not.toHaveBeenCalled();
  });

  it("keeps what was typed so it can be corrected", async () => {
    const result = await search(formData("z"));

    expect(result.status === "error" && result.query).toBe("z");
  });

  it("throttles a flood from one address", async () => {
    requestHeaders = { "x-forwarded-for": "203.0.113.9" };

    for (let i = 0; i < 60; i += 1) {
      await search(formData(`query ${i}`));
    }
    expect(searchCards).toHaveBeenCalledTimes(60);

    const blocked = await search(formData("one too many"));
    expect(blocked.status).toBe("error");
    expect(searchCards).toHaveBeenCalledTimes(60);
  });
});
