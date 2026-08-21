import { describe, expect, it } from "vitest";

import {
  normalisePostalCode,
  pointForPostalCode,
  pointFromCoords,
} from "@/lib/geo/zip";

/**
 * Where a player is, and the promises the shape of the data keeps.
 *
 * The founder's correction that produced all of this: "it should be
 * asking for location permissions to find stores near them, or at the
 * very least asking for a zip code of their address. nothing to do with
 * 'my store', because most of this is customer/player facing."
 */
describe("postal codes", () => {
  it("takes the five digits out of what people actually type", () => {
    expect(normalisePostalCode("97477")).toBe("97477");
    expect(normalisePostalCode("  97477 ")).toBe("97477");
    /* Browser autofill loves ZIP+4, and a nine-digit string must not
       become a rejection the player cannot explain. */
    expect(normalisePostalCode("97477-1234")).toBe("97477");
  });

  it("refuses anything that is not a ZIP", () => {
    expect(normalisePostalCode("9747")).toBeNull();
    expect(normalisePostalCode("SW1A 1AA")).toBeNull();
    expect(normalisePostalCode("")).toBeNull();
    expect(normalisePostalCode(null)).toBeNull();
  });

  it("only produces five digits, which is what the column allows", () => {
    /* The check constraint is `^[0-9]{5}$`. If this function can return
       anything else, a save fails in the database rather than in the
       form, and the player is told nothing useful. See
       20260925090000_player_postal_code.sql. */
    for (const raw of ["97477", "  97477 ", "97477-1234", "00601"]) {
      const zip = normalisePostalCode(raw);
      expect(zip).toMatch(/^[0-9]{5}$/);
    }
  });

  it("places a real ZIP within a few miles of where it is", () => {
    const springfield = pointForPostalCode("97477");
    expect(springfield).not.toBeNull();
    /* Springfield, Oregon. Loose bounds on purpose - this asserts the
       table is the right table, not the Census Bureau's arithmetic. */
    expect(springfield!.latitude).toBeGreaterThan(43.9);
    expect(springfield!.latitude).toBeLessThan(44.2);
    expect(springfield!.longitude).toBeGreaterThan(-123.2);
    expect(springfield!.longitude).toBeLessThan(-122.8);
  });

  it("knows the ZIPs of the two cities we have imported stores for", () => {
    expect(pointForPostalCode("78701")).not.toBeNull(); // Austin, TX
    expect(pointForPostalCode("97401")).not.toBeNull(); // Eugene, OR
  });

  it("returns nothing for five digits that are not a ZIP", () => {
    /* Saves cleanly and then finds nothing, which reads as a broken
       feature rather than a bad ZIP - so it is caught before writing. */
    expect(pointForPostalCode("00000")).toBeNull();
    expect(pointForPostalCode("99999")).toBeNull();
  });
});

describe("device coordinates", () => {
  it("takes a real position from a phone", () => {
    expect(pointFromCoords("44.0585", "-123.0116")).toEqual({
      latitude: 44.0585,
      longitude: -123.0116,
    });
  });

  it("rejects the null island a broken location stack reports", () => {
    /* (0, 0) is in the Gulf of Guinea, and it is what a failed fix
       looks like far more often than it is a real position. Anchoring
       somebody's feed there would show an empty list they cannot
       explain. */
    expect(pointFromCoords(0, 0)).toBeNull();
  });

  it("rejects junk rather than trusting a query string", () => {
    expect(pointFromCoords("north", "west")).toBeNull();
    expect(pointFromCoords("91", "0")).toBeNull();
    expect(pointFromCoords("0", "181")).toBeNull();
    expect(pointFromCoords(null, null)).toBeNull();
    expect(pointFromCoords("44.05", undefined)).toBeNull();
  });
});

describe("what is stored", () => {
  it("has no way to write down a device coordinate", async () => {
    /* The privacy promise is kept by the schema, not by a policy. A
       granted position rides one request as a query param; the only
       column that holds a position is five coarse digits the player
       typed. If a latitude column ever appears on `players`, this
       fails and somebody has to argue for it. */
    const types = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/supabase/types.ts", "utf8"),
    );

    const playerRow = types.slice(
      types.indexOf("export type PlayerRow = {"),
      types.indexOf("export type PlayerInsert"),
    );

    expect(playerRow).toContain("postal_code");
    expect(playerRow).not.toMatch(/\blatitude\b/);
    expect(playerRow).not.toMatch(/\blongitude\b/);
  });
});
