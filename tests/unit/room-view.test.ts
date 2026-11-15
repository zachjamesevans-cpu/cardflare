import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as web from "@/lib/events/room-view";
import * as app from "../../mobile/src/room-view";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The founder (2026-11-15): "When someone scans into a room I feel like
 * it should be dead simple imo. This is so much info." While a night is
 * on, the screen is the room; before it, the planning dashboard.
 */
describe("which room a person is looking at", () => {
  it("is the room only while the night is on", () => {
    expect(web.roomViewFor("live")).toBe("in-room");
    for (const phase of ["upcoming", "early", "pending", "finished", null, undefined]) {
      expect(web.roomViewFor(phase)).toBe("planning");
    }
  });

  it("counts players in the header, never 'here now'", () => {
    expect(web.roomPlayersLine(1)).toBe("1 player");
    expect(web.roomPlayersLine(3)).toBe("3 players");
    expect(web.roomPlayersLine(0)).toBe("Nobody yet");
    /* The founder took "here now" out on 2026-10-09: it counted people
       looking at the room from home. */
    expect(read("src/lib/events/room-view.ts")).not.toMatch(/here now/i);
  });

  it("says one match line, and nothing when nobody here matters to you", () => {
    expect(web.roomMatchLine(null)).toBeNull();
    expect(web.roomMatchLine({ cardsHuntingHere: 0, playersWantYours: 0 })).toBeNull();
    expect(web.roomMatchLine({ cardsHuntingHere: 4, playersWantYours: 0 })).toBe(
      "4 cards you're hunting are here",
    );
    expect(web.roomMatchLine({ cardsHuntingHere: 1, playersWantYours: 2 })).toBe(
      "1 card you're hunting is here · 2 players want cards you have",
    );
    expect(web.roomMatchLine({ cardsHuntingHere: 0, playersWantYours: 1 })).toBe(
      "1 player wants cards you have",
    );
  });

  it("folds your own Flares to one line", () => {
    expect(web.yourFlaresLine(1)).toBe("Your 1 Flare is up");
    expect(web.yourFlaresLine(16)).toBe("Your 16 Flares are up");
  });

  it("reads the same in the app", () => {
    for (const phase of ["live", "upcoming", "early", "pending", "finished", null]) {
      expect(app.roomViewFor(phase)).toBe(web.roomViewFor(phase));
    }
    for (const n of [0, 1, 2, 16]) {
      expect(app.roomPlayersLine(n)).toBe(web.roomPlayersLine(n));
      expect(app.yourFlaresLine(n)).toBe(web.yourFlaresLine(n));
      for (const m of [0, 1, 3]) {
        const summary = { cardsHuntingHere: n, playersWantYours: m };
        expect(app.roomMatchLine(summary)).toBe(web.roomMatchLine(summary));
      }
    }
    expect(app.SHOW_YOUR_FLARES).toBe(web.SHOW_YOUR_FLARES);
    expect(app.HIDE_YOUR_FLARES).toBe(web.HIDE_YOUR_FLARES);
  });

  it("is the same file on both platforms below its header", () => {
    const body = (path: string) =>
      read(path).slice(read(path).indexOf("export type RoomView"));
    expect(body("mobile/src/room-view.ts")).toBe(body("src/lib/events/room-view.ts"));
  });
});
