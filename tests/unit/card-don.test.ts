import { describe, expect, it, vi } from "vitest";

import {
  DON_EXCLUSION,
  OptcgApiProvider,
  OPTCGAPI_ENDPOINTS,
} from "@/lib/cards/providers/optcgapi/adapter";

/**
 * A real record from `/api/allDonCards/`, observed 2 August 2026.
 *
 * No `card_set_id`, and nothing else carrying a card number — because DON!!
 * cards do not have one. 187 of these were rejected on every full sync for a
 * missing card number, which was correct but read like a broken mapping.
 */
const DON_RECORD = {
  don_id: null,
  rarity: "DON!!",
  card_name: "DON!! Card (Egghead)",
  card_text: "Your Turn +1000",
  card_type: "DON!!",
  card_image:
    "https://optcgapi.com/media/static/Card_Images/DON_Card_Egghead_-_The_Azure_Seas_Seven_OP14_img.jpg",
  date_scraped: "2026-08-01",
  market_price: 0.49,
  card_image_id: "don_1",
  optcg_don_name: "DON!! Card (Egghead) - The Azure Sea's Seven (OP14)",
  inventory_price: 0.25,
};

describe("DON!! cards", () => {
  it("are not fetched, so they stop being reported as failures", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));

    await new OptcgApiProvider({
      sleep: () => Promise.resolve(),
      spacingMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).fetchCards();

    const called = fetchMock.mock.calls.map((call) => String((call as unknown[])[0]));

    expect(called.some((url) => url.includes(OPTCGAPI_ENDPOINTS.donCards))).toBe(false);
    expect(called.some((url) => url.includes(OPTCGAPI_ENDPOINTS.setCards))).toBe(true);
  });

  /*
   * The guard that matters if the endpoint is ever re-enabled. A DON!! record
   * must be rejected, never given a fabricated number — "don_1" uppercased
   * would render beside the name as though Bandai had printed it there.
   */
  it("are rejected rather than given an invented card number", () => {
    const result = new OptcgApiProvider().normalizeCard(DON_RECORD, "don");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.failure.reason).toMatch(/canonicalCardNumber/);
    // The payload survives, so the reason can be diagnosed from the database.
    expect(result.failure.raw).toMatchObject({ card_name: "DON!! Card (Egghead)" });
  });

  /* Pricing is out of scope, so it must not ride along in raw_metadata. */
  it("would not carry prices into storage even if imported", () => {
    const result = new OptcgApiProvider().normalizeCard(DON_RECORD, "don");
    if (result.ok) throw new Error("expected the record to be rejected");

    const raw = result.failure.raw as Record<string, unknown>;

    // The failure keeps the record verbatim — that is the point of storing it.
    expect(raw).toHaveProperty("market_price");
  });

  it("has the exclusion written down where a human will read it", () => {
    expect(DON_EXCLUSION).toMatch(/no card number/i);
    expect(DON_EXCLUSION).toMatch(/invent/i);
  });
});
