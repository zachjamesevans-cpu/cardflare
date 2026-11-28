import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { planNearby } from "../../mobile/src/nearby-plan";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const item = (fields: Record<string, unknown>) => fields as { kind: string };

/*
 * The founder: "i think the nearby thing should solely be used as a
 * persistent nearby trade room, in a way, before anything else", with
 * store discovery left for "a later build once we have more stores
 * adopted".
 */
describe("the Nearby tab is a trade room", () => {
  it("shows who wants your cards, then Flares near you", () => {
    const plan = planNearby([
      item({ kind: "hunt", postId: "p1", around: true }),
      item({ kind: "wanted" }),
      item({ kind: "nearbyMatch" }),
      item({ kind: "hunt", postId: "p2", around: true }),
    ]);
    expect(plan.items.map((each) => each.kind)).toEqual([
      "wanted",
      "nearbyMatch",
      "hunt",
      "hunt",
    ]);
    expect(plan.posts).toBe(2);
  });

  it("leaves store discovery out: rooms, nights, the stores list, plan a visit", () => {
    const plan = planNearby([
      item({ kind: "board", yours: true }),
      item({ kind: "upcoming", nextEventAt: "2026-10-17T02:00:00Z" }),
      item({ kind: "nearbyStores", stores: [{ storeId: "s" }] }),
      item({ kind: "start", topic: "store" }),
    ]);
    expect(plan.items).toEqual([]);
    expect(plan.posts).toBe(0);
    expect(plan.ask).toBeNull();
  });

  it("asks for a location when the server has none", () => {
    const plan = planNearby([
      item({ kind: "nearbyStores", stores: [], needsLocation: true }),
    ]);
    expect(plan.ask).not.toBeNull();
    expect(plan.items).toEqual([]);
  });

  it("is what the Nearby tab draws, in the Feed's own view, with the reach a tap away", () => {
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain(
      'const plan = tab === "nearby" && !guest ? planNearby(all) : null;',
    );
    /* Yours first (2026-11-27): your open Flares, then the room. */
    expect(home).toContain("const shown = plan ? [...mine, ...plan.items] : all;");
    expect(home).toContain("<NearbyHeader");
    expect(home).toContain("void setLocalRadius(miles)");
    /* Posts near you are drawn by the same branch as Following's, so
       compact or classic carries over. */
    expect(home.match(/view === "compact" \?/g)).toHaveLength(1);
    /* One unboxed empty state (NearbyEmpty), not a Card. */
    expect(home).toContain(
      '{nobodyAtAll ? "No other players nearby yet" : "No Flares near you yet"}',
    );
    expect(home).not.toContain("<StoreRow");
    expect(home).not.toContain("All nights ›");
  });
});

describe("Flares near you, from the server", () => {
  const repo = read("src/lib/feed/repository.ts");

  /* Everyone near you, people you follow included (2026-11-27): a
     friend nine miles away "didnt show in nearby for me". */
  it("files posts by everyone near you under around, follows tagged", () => {
    expect(repo).toContain('item.around\n          ? "around"');
    expect(repo).toContain('around: "Flares near you",');
    expect(repo).toContain(
      "nearbyAuthorsFor(playerId, origin, new Set<string>(), reach)",
    );
    expect(repo).toContain(
      "followed: hunt.playerId ? followed.has(hunt.playerId) : false,",
    );
    expect(read("mobile/src/flare-feed-card.tsx")).toContain(
      "{item.followed && !item.yours ? (",
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain(
      "{item.followed && !item.yours && (",
    );
  });

  it("finds them by the viewer's radius, and never the viewer, a follow or a block", () => {
    expect(repo).toContain("const zips = zipsWithin(origin, reach);");
    expect(repo).toContain(
      "if (!id || id === viewerId || exclude.has(id) || blocked.has(id)) continue;",
    );
  });

  it("keeps only the posts inside the reach, not every post their author made", () => {
    expect(repo).toContain(
      ".filter((hunt) => hunt.milesAway !== null && hunt.milesAway <= reach)",
    );
  });
});
