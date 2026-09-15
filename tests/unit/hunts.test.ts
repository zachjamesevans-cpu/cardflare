import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { HUNT_LIMIT, huntLimitFor } from "@/lib/players/hunts";

/**
 * HUNTS: a named set of cards somebody is looking for.
 *
 * The founder: "a way for someone to go onto someone's profile and see
 * their flare groups... they can have a section for their flaregroups
 * with cards they already found, and cards they're still looking for...
 * free users can do two flare groups... pro players get 50 of these."
 *
 * Named "hunts" because the product already says it: the Feed reads "is
 * hunting", the item is a HuntItem, and the composer's own field is the
 * hunt's name. Picking any other word would have meant a third noun for
 * one thing.
 */
describe("how many hunts a player may keep", () => {
  it("is two on the free tier and fifty on a paid one", () => {
    expect(HUNT_LIMIT.free).toBe(2);
    expect(HUNT_LIMIT.pro).toBe(50);

    expect(huntLimitFor("free")).toBe(2);
    expect(huntLimitFor("pro")).toBe(50);
  });

  it("carries upward, because capabilities accumulate", () => {
    /* ultra has everything pro has, max has everything ultra has. A
       paying player who upgrades must not lose hunts. */
    expect(huntLimitFor("ultra")).toBe(50);
    expect(huntLimitFor("max")).toBe(50);
  });

  it("treats an unknown or missing tier as free", () => {
    /* An older row, a null, or a tier this build has never heard of.
       Guessing upward would hand out fifty for free. */
    expect(huntLimitFor(null)).toBe(2);
    expect(huntLimitFor("enterprise")).toBe(2);
  });
});

describe("what a hunt is made of", () => {
  it("stores nothing new: a hunt is the deck label Flares already carry", async () => {
    /*
     * The composer has asked for a group name since batches arrived
     * ("Every card you post from here joins this group"), and the Feed
     * already draws a deck as one post because of it. What was missing
     * was anywhere to SEE the set, not a place to keep it.
     */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");

    expect(hunts).toContain('.select("deck_label, status, quantity, created_at")');
    expect(hunts).toContain('.not("deck_label", "is", null)');
  });

  it("checks a card off by the trade that got it, not by a tick box", async () => {
    /*
     * Progress is the flare's own status - `open` is still looking,
     * `traded` is found - so it cannot drift from what actually
     * happened. A box to tick would be a second thing to keep in step
     * with the first.
     */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain('if (row.status === "traded") hunt.found += 1;');
  });

  it("reads them once for the whole profile", async () => {
    /* A query per hunt is the shape that makes a profile arrive late on
       a shop's wifi. One read and a fold. */
    const profile = await readFile("src/lib/players/profile.ts", "utf8");
    expect(profile).toContain("hunts: await huntsFor(playerId)");
  });
});

describe("the limit is enforced where a hunt is started", () => {
  it("guards the one door: naming a group when posting", async () => {
    const actions = await readFile("src/lib/local/actions.ts", "utf8");
    expect(actions).toContain("canStartHunt(playerId, deckLabel)");
  });

  it("never refuses adding to a hunt they already keep", async () => {
    /* The limit is on how many SETS somebody keeps, not on how many
       cards go in them. */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain("allowed: already || hunts.length < limit");
  });

  it("reads the tier itself rather than trusting the caller", async () => {
    /* A caller that has to fetch the tier first is a caller that can
       forget to, and hand a free player fifty. */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain('.select("tier")');
  });
});

describe("both platforms draw the same panel", () => {
  it("has one on each, with the same rows and the same words", async () => {
    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");

    for (const source of [web, app]) {
      expect(source).toContain("export function HuntsPanel");
      /* The two numbers that are the whole point: what is left says
         whether you can help, what is found says whether it is worth
         reading at all. */
      expect(source).toContain("lookingLabel");
      expect(source).toContain("found");
      /* A finished hunt is not hidden - finishing one is the good
         outcome, and dropping it would only ever show unfinished work. */
      expect(source).toContain("All found");
    }
  });

  it("is drawn on your profile and on somebody else's, on both", async () => {
    const pages = await Promise.all([
      readFile("src/app/profile/page.tsx", "utf8"),
      readFile("src/app/p/[playerId]/page.tsx", "utf8"),
      readFile("mobile/src/screens/profile.tsx", "utf8"),
      readFile("mobile/src/screens/player-profile.tsx", "utf8"),
    ]);

    for (const page of pages) expect(page).toContain("<HuntsPanel");
  });

  it("survives a server that has never heard of hunts", async () => {
    /* The app ships on TestFlight's clock and the server on Vercel's. A
       profile with no hunts field must draw a profile, not a crash. */
    const app = await readFile("mobile/src/api.ts", "utf8");
    expect(app).toContain("hunts?: Hunt[];");

    for (const path of [
      "mobile/src/screens/profile.tsx",
      "mobile/src/screens/player-profile.tsx",
    ]) {
      const screen = await readFile(path, "utf8");
      expect(screen).toContain("profile.hunts ?? []");
    }
  });
});
