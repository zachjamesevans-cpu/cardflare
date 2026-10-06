import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { wantKey } from "@/lib/players/wants";

/*
 * The founder, on a player's profile: "it's not showing the cards she's
 * checked off", and "it seems kinda redundant to have people see cards
 * they've already found". A card ticked off in a hunt wrote the hunt
 * request alone, and the profile read saved wants alone, so it stayed on
 * the profile as if still wanted.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

describe("found cards come off a profile", () => {
  it("keys a want on its card and printing", () => {
    expect(wantKey("card", "printing")).toBe("card|printing");
    expect(wantKey("card", null)).toBe("card|");
    expect(wantKey("card", null)).not.toBe(wantKey("card", "printing"));
  });

  it("reads done from hunt requests and Flares, and lets anything still looking win", () => {
    const wants = read("src/lib/players/wants.ts");
    const done = wants.slice(wants.indexOf("export async function doneWantKeys"));
    expect(done).toContain('.from("hunt_requests")');
    expect(done).toContain("completeRequests.has(flare.hunt_request_id)");
    expect(done).toContain('.from("flares")');
    expect(done).toContain('.is("removed_at", null)');
    expect(done).toContain("for (const key of stillLooking) done.delete(key);");
  });

  it("filters the profile's wants through it", () => {
    const profile = read("src/lib/players/profile.ts");
    expect(profile).toContain("doneWantKeys(playerId)");
    expect(profile).toContain("!done.has(wantKey(row.cardId, row.printingId))");
    expect(profile).toContain("[...open, ...offerings]");
  });

  it("carries a hunt's tick to the request's open Flares", () => {
    const hunts = read("src/lib/players/hunts.ts");
    const set = hunts.slice(
      hunts.indexOf("export async function setRequestFound"),
      hunts.indexOf("export async function removeHuntRequest"),
    );
    expect(set).toContain("await syncRequestFlares(requestId, next, now)");
    const sync = hunts.slice(hunts.indexOf("async function syncRequestFlares"));
    expect(sync).toContain('.eq("hunt_request_id", requestId)');
    expect(sync).toContain("splitFound(found, rows)");
  });
});
