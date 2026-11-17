import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openRoomIsRunning, WALK_IN_IDLE_MS } from "@/lib/events/room-live";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/*
 * The founder (2026-11-17): "EVERYTIME I open the app... it says room
 * open at Mox. Why? Then I click it and it says I need to open it." The
 * banner believed a room's status; rooms close lazily, at the next scan.
 * The banner now asks the counter's own question.
 */
const NOW = Date.parse("2026-11-17T20:00:00Z");
const HOUR = 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("whether an open room is really running", () => {
  const walkIn = {
    kind: "walk_in",
    startsAt: iso(NOW - 10 * HOUR),
    endsAt: null,
    lastActivityAt: iso(NOW - HOUR),
    walkInEnabled: true,
  };

  it("keeps a walk-in room somebody used within the idle window", () => {
    expect(openRoomIsRunning(walkIn, NOW)).toBe(true);
  });

  it("drops a walk-in room that has gone quiet, as the counter would close it", () => {
    expect(
      openRoomIsRunning(
        { ...walkIn, lastActivityAt: iso(NOW - WALK_IN_IDLE_MS - 1) },
        NOW,
      ),
    ).toBe(false);
  });

  it("measures a room nobody joined from when it opened", () => {
    expect(
      openRoomIsRunning(
        { ...walkIn, lastActivityAt: null, startsAt: iso(NOW - 7 * HOUR) },
        NOW,
      ),
    ).toBe(false);
    expect(
      openRoomIsRunning(
        { ...walkIn, lastActivityAt: null, startsAt: iso(NOW - HOUR) },
        NOW,
      ),
    ).toBe(true);
  });

  it("drops a walk-in room at a store that switched walk-ins off", () => {
    expect(openRoomIsRunning({ ...walkIn, walkInEnabled: false }, NOW)).toBe(false);
  });

  it("drops a night or a day room past its end, and keeps one still on", () => {
    for (const kind of ["scheduled", "day"]) {
      const night = {
        kind,
        startsAt: iso(NOW - 3 * HOUR),
        endsAt: iso(NOW - 1),
        lastActivityAt: null,
        walkInEnabled: true,
      };
      expect(openRoomIsRunning(night, NOW)).toBe(false);
      expect(openRoomIsRunning({ ...night, endsAt: iso(NOW + HOUR) }, NOW)).toBe(true);
    }
  });

  it("is the number the counter uses", () => {
    expect(WALK_IN_IDLE_MS).toBe(6 * HOUR);
    expect(read("src/lib/events/rooms.ts")).toContain(
      'export { WALK_IN_IDLE_MS } from "./room-live";',
    );
  });
});

describe("the Room open banner", () => {
  it("is decided by the counter's test on the server, never the status alone", () => {
    const locals = read("src/lib/players/locals.ts");
    expect(locals).toContain("openRoomIsRunning(");
    expect(locals).not.toMatch(/if \(event\.status === "open"\) live\.add/);
  });

  it("waits for a fresh answer in the app, never last visit's saved copy", () => {
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain(
      "{meFresh && me?.locals.some((local) => local.liveNow) && (",
    );
    expect(home).toMatch(/setMe\(fresh\);\s*setMeFresh\(true\);/);
  });
});
