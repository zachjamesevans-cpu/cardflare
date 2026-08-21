import { describe, expect, it } from "vitest";

import { scoreRelevance } from "@/lib/places/relevance";
import { boundingBox, milesBetween } from "@/lib/stores/nearby";
import { OPERATORS_PER_PAGE, pageOf } from "@/lib/stores/directory";

/**
 * Judging a candidate store, and keeping a coordinate on the server.
 *
 * The relevance rules are DETERMINISTIC by requirement - "do not rely on
 * an LLM as the sole classifier" - which is what makes them testable at
 * all, and this is the test set the fixtures were written to exercise.
 */
describe("is this a game store", () => {
  it("says likely when the category and the name agree", () => {
    expect(
      scoreRelevance({
        name: "Dragon's Hoard Games",
        categories: ["hobby_shop", "trading_card_store"],
        website: "https://example.invalid",
        confidence: 0.94,
      }).verdict,
    ).toBe("likely");
  });

  it("refuses a mass retailer however it is categorised", () => {
    /* A Walmart with a toy_store category is still a Walmart, and the
       exclusion is a named list rather than a size heuristic so a real
       hybrid LGS is never caught by it. */
    const scored = scoreRelevance({
      name: "Walmart Supercenter",
      categories: ["department_store", "toy_store", "hobby_shop"],
      website: "https://example.invalid",
      confidence: 0.99,
    });

    expect(scored.verdict).toBe("unlikely");
    expect(scored.reasons[0]).toContain("mass retailer");
  });

  it("does not mistake a video game shop for an LGS", () => {
    expect(
      scoreRelevance({
        name: "Pixel Palace",
        categories: ["video_game_store", "arcade"],
        website: null,
        confidence: 0.7,
      }).verdict,
    ).toBe("unlikely");
  });

  it("leaves a one-signal shop for the admin to decide", () => {
    /* A name and nothing else. "Collectibles" is a coin shop as often as
       a card shop, so this is a recommendation to LOOK, not to import. */
    expect(
      scoreRelevance({
        name: "Riverside Collectibles",
        categories: [],
        website: null,
        confidence: 0.31,
      }).verdict,
    ).toBe("possible");
  });

  it("takes a name and a category together as likely", () => {
    /* Two independent signals is the bar, and "Card Exchange" filed under
       collectibles clears it. The admin still decides. */
    expect(
      scoreRelevance({
        name: "Cedar Park Card Exchange",
        categories: ["collectibles_store"],
        website: null,
        confidence: 0.62,
      }).verdict,
    ).toBe("likely");
  });

  it("quotes the provider on status rather than deciding one", () => {
    /*
     * A correction made against the real release. Overture's published
     * field list omits `operating_status`; the schema has it. So the
     * rules repeat what the provider said, attributed - and say nothing
     * at all when it said nothing, rather than inferring from confidence.
     */
    const quiet = scoreRelevance({
      name: "Riverside Collectibles",
      categories: [],
      website: null,
      confidence: 0.31,
    });

    expect(quiet.reasons.join(" ")).toContain("confidence");
    expect(quiet.reasons.join(" ").toLowerCase()).not.toContain("open");

    const known = scoreRelevance({
      name: "Riverside Collectibles",
      categories: [],
      website: null,
      confidence: 0.31,
      operatingStatus: "open",
    });

    /* Attributed, every time. CardFlare never says a shop is open. */
    expect(known.reasons.join(" ")).toContain("Provider says open");
  });
});

describe("distance, and what leaves the server", () => {
  it("measures a known distance closely enough for a feed row", () => {
    /* Austin to Cedar Park, about 17 miles. A feed says "17 miles"; it
       does not need a survey. */
    const miles = milesBetween(
      { latitude: 30.2672, longitude: -97.7431 },
      { latitude: 30.5217, longitude: -97.8203 },
    );

    expect(miles).toBeGreaterThan(16);
    expect(miles).toBeLessThan(19);
  });

  it("widens the box with latitude, because longitude shrinks", () => {
    const austin = boundingBox({ latitude: 30, longitude: -97 }, 25);
    const anchorage = boundingBox({ latitude: 61, longitude: -149 }, 25);

    const width = (box: { minLon: number; maxLon: number }) => box.maxLon - box.minLon;

    expect(width(anchorage)).toBeGreaterThan(width(austin));
  });

  it("has nowhere to put a coordinate in what it returns", () => {
    /*
     * The privacy rule, as a type rather than a habit: NearbyStore has no
     * latitude and no longitude, so a payload cannot carry one because
     * somebody forgot to strip a field.
     */
    const source = readSource("src/lib/stores/nearby.ts");
    const shape = source.slice(
      source.indexOf("export interface NearbyStore"),
      source.indexOf("const EARTH_MILES"),
    );

    expect(shape).not.toMatch(/\blatitude\b/);
    expect(shape).not.toMatch(/\blongitude\b/);
    expect(shape).toContain("miles: number");
  });
});

function readSource(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolve } = require("node:path") as typeof import("node:path");
  return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
}

describe("the console's list of operators", () => {
  it("shows a page at a time, and clamps a page that no longer exists", () => {
    /*
     * The directory was written when every store was a customer and the
     * list was a dozen names. A discovered directory is hundreds. A
     * filter that shortens the list while somebody is on page four must
     * show them page one rather than nothing at all.
     */
    const rows = Array.from({ length: 60 }, (_, i) => i);

    expect(pageOf(rows, 1).rows).toHaveLength(OPERATORS_PER_PAGE);
    expect(pageOf(rows, 3).pages).toBe(3);
    expect(pageOf(rows, 99).page).toBe(3);
    expect(pageOf(rows, 0).page).toBe(1);
    expect(pageOf([], 4)).toMatchObject({ page: 1, pages: 1, total: 0 });
  });
});
