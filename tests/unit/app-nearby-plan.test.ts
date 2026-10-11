import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { planNearby } from "../../mobile/src/nearby-plan";

/* The Feed's item type, taken from the plan rather than imported from
   the app's api module (which the website's build cannot load). */
type FeedEntry = Parameters<typeof planNearby>[0][number];

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const item = (fields: Record<string, unknown>) => fields as unknown as FeedEntry;

/*
 * The founder: "the nearby screen needs an overhaul", then "let's bring
 * back nearby as a kinda flares near me vibe".
 */
describe("the Nearby tab's layout", () => {
  const upcoming = (storeId: string, at: string | null, walkIn = !at) =>
    item({
      kind: "upcoming",
      storeId,
      storeName: storeId,
      city: null,
      joinCode: `C-${storeId}`,
      nextEventAt: at,
      nextEventName: null,
      nextEventCode: null,
      timeZone: "America/Los_Angeles",
      walkIn,
      wants: 0,
    });

  it("puts who needs your cards, then posts near you, before the stores", () => {
    const plan = planNearby([
      upcoming("mox", null),
      item({ kind: "hunt", postId: "p1", around: true }),
      item({ kind: "wanted", total: 1, entries: [] }),
    ]);
    expect(plan.before.map((each) => each.kind)).toEqual(["wanted", "hunt"]);
  });

  it("turns walk-in stores into tiles and keeps dated nights as cards", () => {
    const plan = planNearby([
      upcoming("mox", null),
      upcoming("untapped", "2026-10-17T02:00:00Z"),
    ]);
    expect(plan.stores.map((tile) => tile.name)).toEqual(["mox", "untapped"]);
    expect(plan.stores[0].status).toBe("Walk-in");
    expect(plan.after.map((each) => (each as { storeId: string }).storeId)).toEqual([
      "untapped",
    ]);
  });

  it("leads Coming up with the nights you said you are going to", () => {
    const night = (storeId: string, youGoing: boolean) =>
      item({ ...(upcoming(storeId, "2026-10-17T02:00:00Z") as object), youGoing });
    const plan = planNearby([night("maybe", false), night("going", true)]);
    expect(plan.after.map((each) => (each as { storeId: string }).storeId)).toEqual([
      "going",
      "maybe",
    ]);
  });

  it("shows a room open at your store as live, and drops rooms far away", () => {
    const board = (yours: boolean) =>
      item({
        kind: "board",
        code: yours ? "MINE" : "FAR",
        storeName: yours ? "Mine" : "Far",
        city: null,
        yours,
        eventName: "Night",
        live: true,
        startsAt: null,
        timeZone: "UTC",
        youCanAnswer: 0,
        sample: [],
      });
    const plan = planNearby([board(true), board(false)]);
    expect(plan.stores).toHaveLength(1);
    expect(plan.stores[0]).toMatchObject({ name: "Mine", live: true, status: "Open now" });
    expect(plan.before).toHaveLength(0);
    expect(plan.after).toHaveLength(0);
  });

  it("lists nearby stores by distance, and asks for a location first when it has none", () => {
    const known = planNearby([
      item({
        kind: "nearbyStores",
        stores: [
          { storeId: "s1", name: "Close", city: null, miles: 0.4, verified: false, ultra: false, unclaimed: true },
          { storeId: "s2", name: "Far", city: null, miles: 12.6, verified: false, ultra: false, unclaimed: true },
        ],
      }),
    ]);
    expect(known.stores.map((tile) => tile.status)).toEqual(["<1 mi", "13 mi"]);
    expect(known.ask).toBeNull();

    const unknown = planNearby([item({ kind: "nearbyStores", stores: [], needsLocation: true })]);
    expect(unknown.ask).not.toBeNull();
    expect(unknown.stores).toHaveLength(0);
  });

  it("is what the Feed draws on Nearby, with the reach a tap away", () => {
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain('const plan = tab === "nearby" && !guest ? planNearby(all) : null;');
    expect(home).toContain("<NearbyHeader");
    expect(home).toContain("void setLocalRadius(miles)");
  });
});

describe("Flares near you, from the server", () => {
  const repo = read("src/lib/feed/repository.ts");

  it("files posts by people near you that you do not follow under around", () => {
    expect(repo).toContain('return item.yours ? "yours" : item.around ? "around" : "people";');
    expect(repo).toContain('around: "Flares near you",');
    expect(repo).toContain("await nearbyAuthorsFor(playerId, origin, new Set(authors.keys()))");
  });

  it("finds them by the viewer's radius, and never the viewer, a follow or a block", () => {
    expect(repo).toContain("zipsWithin(origin, await feedRadiusFor(viewerId))");
    expect(repo).toContain(
      "if (!id || id === viewerId || exclude.has(id) || blocked.has(id)) continue;",
    );
  });
});
