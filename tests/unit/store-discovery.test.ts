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

describe("the candidate snapshot the console imports from", () => {
  it("is bundled by an import, never read off the disk at runtime", () => {
    /*
     * A DEPLOYMENT fact, not a style choice. Next.js traces the files a
     * serverless function needs by analysing the source, and it cannot
     * see through a dynamic directory read - so `readdirSync` over
     * `process.cwd()/data` works locally and is simply absent on Vercel.
     * `snapshots()` would return nothing, the provider would fall back to
     * the FIXTURES, and the console's Import button would write
     * "Dragon's Hoard Games" and "Walmart Supercenter" into the live
     * database as real stores.
     */
    /* Comments stripped, so the paragraph explaining the bug cannot trip
       the guard against it. */
    const source = readSource("src/lib/places/snapshot.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(source).toContain("data/store-candidates/austin-tx.json");
    expect(source).not.toContain("readdirSync");
    expect(source).not.toContain("process.cwd()");
  });

  it("carries the licence and attribution its records came with", () => {
    /* Overture Places is a mix of licences, so provenance is a property
       of the snapshot rather than a constant in the code. */
    const snapshot = JSON.parse(readSource("data/store-candidates/austin-tx.json")) as {
      provider: string;
      release: string;
      attribution: string;
      candidates: { providerPlaceId: string; name: string }[];
    };

    expect(snapshot.provider).toBe("overture");
    expect(snapshot.release).toBe("2026-08-19.0");
    expect(snapshot.attribution).toContain("Overture Maps Foundation");
    expect(snapshot.candidates.length).toBeGreaterThan(0);
    for (const candidate of snapshot.candidates.slice(0, 20)) {
      expect(candidate.providerPlaceId).toBeTruthy();
      expect(candidate.name).toBeTruthy();
    }
  });
});

describe("publishing, verifying and Ultra", () => {
  const actions = readSource("src/lib/stores/listing-actions.ts");

  it("keeps them three separate decisions", () => {
    /*
     * Publishing says a discovered record is real enough to show.
     * Verifying says CardFlare confirmed who controls the profile - trust,
     * never for sale. Ultra is the commercial tier. One control implying
     * they move together is the confusion the schema exists to prevent.
     */
    expect(actions).toContain("export async function setListingStateAction");
    expect(actions).toContain("export async function setVerifiedAction");
    expect(actions).toContain("export async function setTierAction");
  });

  it("never lets buying Ultra imply verification", () => {
    const tier = actions.slice(actions.indexOf("export async function setTierAction"));

    expect(tier).toContain("tier: ultra");
    expect(tier).not.toContain("verified_at");
  });

  it("records when a business was verified, not merely that it was", () => {
    /* "Verified when" is the first question of any dispute. */
    expect(actions).toContain(
      "verified_at: verified ? new Date().toISOString() : null",
    );
    expect(actions).toContain("verified_by: verified ? user.id : null");
  });

  it("puts every one behind the admin guard", () => {
    /* These are the only writes to those columns in the product, and a
       client must never send `verified = true` and be believed. */
    const guards = actions.match(/requireAdmin\(\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(4);
  });

  it("has no publish-everything switch", () => {
    /* Bulk publish names its ids, so it stays a selection somebody made
       rather than a switch somebody flipped. */
    expect(actions).toContain('String(form.get("storeIds")');
    expect(actions).not.toMatch(/update\(\{ listing_state: "published" \}\)\s*;/);
  });
});

describe("what the console reports after an import", () => {
  const lib = readSource("src/lib/stores/discovery.ts");
  const actions = readSource("src/lib/stores/discovery-actions.ts");

  it("counts a failure as a failure, never as a skip", () => {
    /*
     * The bug this exists for. A failed insert used to add to `skipped`,
     * and the console printed the total as "already known" - so on a
     * database missing the directory migration, thirty-five inserts
     * failing read back as thirty-five stores that were already there.
     * A count that cannot tell success from failure is worse than none.
     */
    expect(lib).toContain("failed: number");
    expect(lib).toContain("failed += 1;");
    expect(lib).not.toMatch(
      /console\.error\("Could not create the store listing"[\s\S]{0,80}skipped \+= 1/,
    );
    expect(actions).toContain("Nothing was created.");
  });

  it("says plainly when the migration has not been applied", () => {
    /* Deploying the app and applying the migrations are two acts in this
       project, and nothing runs the second one automatically. */
    expect(lib).toContain("export async function directorySchemaReady");
    expect(lib).toContain(
      "The store directory migration has not been applied to this database.",
    );
  });
});

describe("an unclaimed listing's contact email", () => {
  it("is null rather than an empty string", () => {
    /*
     * Found by the import failing thirty-five times on
     * `stores_contact_email_shape`. Nobody at an unclaimed shop has
     * agreed to hear from us, so there is no address - and "" fails the
     * check the column has carried since the first migration, while also
     * reading as a real-but-blank address everywhere downstream.
     */
    const lib = readSource("src/lib/stores/discovery.ts");

    expect(lib).toContain("contact_email: null,");
    expect(lib).not.toContain('contact_email: "",');
  });

  it("is allowed through by the constraint the migration rewrites", () => {
    const migration = readSource(
      "supabase/migrations/20260924090000_unclaimed_stores_have_no_email.sql",
    );

    expect(migration).toContain("alter column contact_email drop not null");
    expect(migration).toContain("contact_email is null");
    /* And a non-null value is still checked for shape. */
    expect(migration).toContain("[^@[:space:]]+@[^@[:space:]]+");
  });
});
