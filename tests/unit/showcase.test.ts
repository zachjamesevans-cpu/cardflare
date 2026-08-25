import { describe, expect, it } from "vitest";

import { acceptsLabel, acceptsSchema, partitionByIntent } from "@/lib/lists/schema";
import {
  FEATURE_TIERS,
  hasFeature,
  isFeatureFree,
  meetsTier,
} from "@/lib/billing/features";

/**
 * Showcases: a Flare pointed the other way.
 *
 * Two rules with teeth. The board must never read the two directions
 * as one list — walking over to somebody about a card they were trying
 * to get rid of is exactly the failure the feature exists to prevent.
 * And the paid gate must be a single switch, so shipping this free
 * today and charging for it later is one edit rather than a hunt.
 */

const entry = (id: string, intent: "want" | "showcase") => ({ id, intent });

describe("partitionByIntent", () => {
  it("separates the two directions, keeping each one's order", () => {
    const { showcases, wants } = partitionByIntent([
      entry("a", "want"),
      entry("b", "showcase"),
      entry("c", "want"),
      entry("d", "showcase"),
    ]);

    expect(showcases.map((e) => e.id)).toEqual(["b", "d"]);
    expect(wants.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("treats a board with no showcases as all wants", () => {
    const { showcases, wants } = partitionByIntent([
      entry("a", "want"),
      entry("b", "want"),
    ]);

    expect(showcases).toEqual([]);
    expect(wants).toHaveLength(2);
  });

  it("handles an empty player section", () => {
    expect(partitionByIntent([])).toEqual({ showcases: [], wants: [] });
  });
});

describe("the feature gate", () => {
  it("ships showcases free for now", () => {
    expect(FEATURE_TIERS.showcase).toBeNull();
    expect(isFeatureFree("showcase")).toBe(true);
    expect(hasFeature("showcase", null)).toBe(true);
  });

  /*
   * The switch that matters, tested through the real rule rather than a
   * copy of it: `meetsTier` is what `hasFeature` calls, so these pin the
   * behaviour the gate WILL have the day showcases become Pro.
   */
  it("admits every paying tier once a feature requires Pro", () => {
    expect(meetsTier("pro", null)).toBe(false);
    expect(meetsTier("pro", "pro")).toBe(true);
    // A shop paying for Ultra is never told a player feature is above
    // their plan; the ladder is inclusion, not audience.
    expect(meetsTier("pro", "ultra")).toBe(true);
    expect(meetsTier("pro", "max")).toBe(true);
  });

  it("keeps the store tiers above each other", () => {
    expect(meetsTier("ultra", "pro")).toBe(false);
    expect(meetsTier("ultra", "ultra")).toBe(true);
    expect(meetsTier("ultra", "max")).toBe(true);
    expect(meetsTier("max", "ultra")).toBe(false);
    expect(meetsTier("max", "max")).toBe(true);
  });

  it("lets everyone through a feature that requires nothing", () => {
    for (const tier of [null, "pro", "ultra", "max"] as const) {
      expect(meetsTier(null, tier)).toBe(true);
    }
  });
});

/**
 * What the poster will take, as the board says it.
 *
 * Trade-only stays silent on purpose: it is what cardflare has always
 * meant, and a badge on every single row is furniture. The label exists
 * to mark the rows that break that assumption.
 */
describe("acceptsLabel", () => {
  it("says nothing for a plain trade, which is the assumed default", () => {
    expect(acceptsLabel({ acceptsTrade: true, acceptsCash: false })).toBeNull();
  });

  it("calls out cash only, because it changes what you bring", () => {
    expect(acceptsLabel({ acceptsTrade: false, acceptsCash: true })).toBe("Cash only");
  });

  it("calls out either, because it widens who can answer", () => {
    expect(acceptsLabel({ acceptsTrade: true, acceptsCash: true })).toBe(
      "Trade or cash",
    );
  });
});

describe("acceptsSchema", () => {
  it("reads unticked checkboxes as a plain trade", () => {
    expect(acceptsSchema.parse({})).toEqual({
      acceptsTrade: true,
      acceptsCash: false,
    });
  });

  it("reads a ticked checkbox's 'on' as true", () => {
    expect(acceptsSchema.parse({ acceptsTrade: "on", acceptsCash: "on" })).toEqual({
      acceptsTrade: true,
      acceptsCash: true,
    });
  });

  /* The shape the database refuses. Rescued rather than rejected: the
     poster's real mistake is a mis-tap, not a hostile payload. */
  it("rescues a Flare that would accept nothing", () => {
    expect(acceptsSchema.parse({ acceptsTrade: "", acceptsCash: "" })).toEqual({
      acceptsTrade: true,
      acceptsCash: false,
    });
  });
});
