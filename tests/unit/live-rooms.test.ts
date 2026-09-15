import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * "LIVE" HAS ONE DEFINITION, AND EVERYTHING ASKS IT.
 *
 * The founder, looking at his own want list: "notice how it says these
 * flares are live at x stores. they are not. those rooms are all
 * closed... create a failsafe so that this doesn't happen going
 * forward."
 *
 * The bug was not a wrong query, it was a question nobody asked. The
 * want list checked whether the FLARE was open - which it was, a Flare
 * is not closed when its room closes - joined to the event to get a shop
 * name, and printed "Live at" without ever asking whether the room was
 * still running.
 *
 * `status = 'open'` would not have caught it either. A room stays open
 * in the table long after it stops being live: a scheduled night that
 * has ended, a walk-in room nobody has touched in hours. Liveness is
 * those RULES - doors-open lead, end time, idle timeout - and they live
 * in one function.
 *
 * So this file is the failsafe. It does not test that today's callers
 * are right; it tests that nobody can decide for themselves tomorrow.
 */
const SAYS_LIVE = [
  "src/lib/players/wants.ts",
  "src/lib/feed/repository.ts",
  "src/lib/players/locals.ts",
];

describe("the one definition of a live room", () => {
  it("lives in one place, with the rules in it", async () => {
    const rooms = await readFile("src/lib/events/rooms.ts", "utf8");

    expect(rooms).toContain("export async function liveEventIds");
    expect(rooms).toContain("export async function listLiveRooms");

    /* The rules, not a column: a scheduled room is live from doors-open
       until it ends, a walk-in until it goes idle. */
    expect(rooms).toContain("DOORS_OPEN_LEAD_MS");
    expect(rooms).toContain("isIdle(");
  });

  it("is what the want list asks before it says Live at", async () => {
    /* The exact bug the founder found. */
    const wants = await readFile("src/lib/players/wants.ts", "utf8");

    expect(wants).toContain("liveEventIds(eventIds)");
    /* And the store names come from the live set, not from every event
       the flares happen to sit on. */
    expect(wants).toContain('.in("id", [...live])');
  });

  it("stops any of these deciding liveness for themselves", async () => {
    /*
     * The failsafe proper. Reading the events table and judging a room
     * from `status` is exactly the mistake that shipped, so a file that
     * claims something is live has to go through the shared answer.
     *
     * If this fails for a new file, the fix is to call `liveEventIds`,
     * not to add the file to the list.
     */
    for (const path of SAYS_LIVE) {
      const source = await readFile(path, "utf8");
      const claimsLive = /live/i.test(source);
      if (!claimsLive) continue;

      const judgesForItself =
        /\.eq\(\s*"status",\s*"open"\s*\)[\s\S]{0,200}from\("events"\)/.test(source);
      expect(judgesForItself, `${path} decides liveness from a status column`).toBe(
        false,
      );
    }
  });

  it("names one shop only when there is one", async () => {
    /*
     * "They're live at different stores." A card can be up at several at
     * once, and naming whichever row came back first was a coin toss
     * dressed as a fact.
     */
    const wants = await readFile("src/lib/players/wants.ts", "utf8");
    expect(wants).toContain("shops.size === 1 ? only : `${shops.size} stores`");
  });
});
