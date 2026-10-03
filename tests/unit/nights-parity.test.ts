import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as webCopy from "@/lib/events/going-copy";

/**
 * Nights, on both platforms, in the same round.
 *
 * The founder (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts." And on the dock: "Trying to keep our
 * tabs to our 'hero's'." Room's slot becomes Nights.
 *
 * His standing instruction is that every change ships to the website
 * and the app alike: same sections, same wording, same buttons, same
 * order. This reads both sources and holds the words and the dock to
 * one another, so a platform cannot drift quietly the way the Feed
 * once did. Whether either one looks right is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const appCopySource = read("mobile/src/going-copy.ts");
const webCopySource = read("src/lib/events/going-copy.ts");

const webDock = read("src/components/players/player-tabs.tsx");
const appRoot = read("mobile/App.tsx");

const webNights = read("src/components/nights/night-list.tsx");
const webNightsPage = read("src/app/nights/page.tsx");
const appNights = read("mobile/src/screens/nights.tsx");

const webButton = read("src/components/nights/going-button.tsx");
const appButton = read("mobile/src/going-button.tsx");

const webRoom = read("src/app/e/[code]/page.tsx");
const webPreStart = read("src/components/events/pre-start-room.tsx");
const appRoom = read("mobile/src/screens/room.tsx");

const webFeedItems = read("src/components/feed/feed-items.tsx");
const appHome = read("mobile/src/screens/home.tsx");

const webStore = read("src/app/s/[storeId]/page.tsx");
const appStore = read("mobile/src/screens/store-profile.tsx");

const webEventList = read("src/components/events/event-list.tsx");
const webEarlyPicker = read("src/components/events/early-board-picker.tsx");

/** The exact strings the brief pins, by the constant that carries each. */
const PINNED = {
  GOING: "Going",
  YOURE_GOING: "You're going",
  PRE_START_PITCH:
    "See who's going and what they're hunting. Say you're going and your Flares and trade binders join the board.",
  YOURE_ON_THE_BOARD: "You're going. Your Flares are on the board.",
  NO_NIGHTS: "No nights near you yet. Follow a store to see its nights here.",
  SCAN_OR_CODE: "Scan or enter a code",
} as const;

/** Every `export const NAME = "..."` in a copy file, strings only. */
function constants(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/export const (\w+) =\s*"((?:[^"\\]|\\.)*)";/g)) {
    out[match[1]!] = match[2]!;
  }
  return out;
}

/** The app's goingLine, run as written, so its three forms are tested and not just read. */
function appGoingLine(): (n: number) => string {
  const match = appCopySource.match(
    /export function goingLine\(n: number\): string \{([\s\S]*?)\n\}/,
  );
  if (!match) throw new Error("mobile/src/going-copy.ts has no goingLine");
  return new Function("n", match[1]!) as (n: number) => string;
}

describe("the words around Going", () => {
  it("are the pinned strings on the website", () => {
    expect(constants(webCopySource)).toEqual(PINNED);
    expect(webCopy.GOING).toBe(PINNED.GOING);
    expect(webCopy.YOURE_GOING).toBe(PINNED.YOURE_GOING);
    expect(webCopy.PRE_START_PITCH).toBe(PINNED.PRE_START_PITCH);
    expect(webCopy.YOURE_ON_THE_BOARD).toBe(PINNED.YOURE_ON_THE_BOARD);
    expect(webCopy.NO_NIGHTS).toBe(PINNED.NO_NIGHTS);
    expect(webCopy.SCAN_OR_CODE).toBe(PINNED.SCAN_OR_CODE);
  });

  it("are the pinned strings in the app, word for word", () => {
    expect(constants(appCopySource)).toEqual(PINNED);
  });

  it("count the roster the same way on both", () => {
    const app = appGoingLine();
    for (const [n, line] of [
      [0, "Nobody going yet"],
      [1, "1 going"],
      [2, "2 going"],
      [17, "17 going"],
    ] as const) {
      expect(webCopy.goingLine(n)).toBe(line);
      expect(app(n)).toBe(line);
    }
  });

  it("have no em dash anywhere in them", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const value of Object.values(PINNED)) expect(value).not.toContain(emDash);
    expect(webCopySource).not.toContain(emDash);
    expect(appCopySource).not.toContain(emDash);
  });
});

describe("the dock", () => {
  it("gives Room's slot to Nights on the website", () => {
    expect(webDock).toContain(
      '{ href: "/nights", label: "Nights", icon: CalendarDays }',
    );
    expect(webDock).not.toContain('label: "Room"');
    expect(webDock).toMatch(
      /import \{[^}]*\bCalendarDays\b[^}]*\} from "lucide-react"/,
    );
  });

  it("keeps Nights lit on /nights, /room and /e/ on the website", () => {
    expect(webDock).toContain('LOCAL_ENABLED ? "/feed" : "/nights"');
    expect(webDock).toContain('pathname.startsWith("/e/")');
    expect(webDock).toContain('pathname === "/room"');
  });

  it("gives Room's slot to Nights in the app, calendar idle and filled focused", () => {
    expect(appRoot).toContain('name="Nights"');
    expect(appRoot).toContain('tabBarLabel: "Nights"');
    expect(appRoot).not.toMatch(/<Tab\.Screen\s+name="Room"/);
    expect(appRoot).toContain(
      'Nights: { idle: "calendar-outline", focused: "calendar" }',
    );
  });

  it("keeps the old Room reachable from Nights on both", () => {
    /* Website: a link to /room. App: the Room stack screen, pushed. */
    expect(webNights).toContain('href="/room"');
    expect(webNights).toContain("SCAN_OR_CODE");
    expect(appNights).toContain("SCAN_OR_CODE");
    expect(appRoot).toMatch(/<Stack\.Screen\s+name="Room"/);
  });
});

describe("the Nights screen", () => {
  it("is headed Nights on both", () => {
    expect(webNights).toContain(">Nights</h2>");
    expect(webNightsPage).toContain('title="Nights"');
    expect(appRoot).toContain('title: "Nights"');
  });

  it("draws the same three sections in the same order on both", () => {
    const order = ["Live now", "You're going", "Coming up"];
    for (const source of [webNights, appNights]) {
      const positions = order.map((title) => source.indexOf(`"${title}"`));
      expect(positions.every((at) => at >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
  });

  it("says the same thing when there is nothing to show", () => {
    expect(webNights).toContain("NO_NIGHTS");
    expect(appNights).toContain("NO_NIGHTS");
    /* With a way to the Feed, where following a store happens. */
    expect(webNights).toContain('href="/feed"');
  });

  it("counts the roster through goingLine on both", () => {
    /* The count rides with the button on every row that has one, and
       a live row, which has no button, says it on its own. The button
       draws it through goingLine (pinned below), so a screen that
       draws nothing but buttons has still said it the one way. */
    expect(webNights).toContain("goingLine(");
    expect(appNights).toMatch(/goingLine\(|<GoingButton/);
  });
});

describe("the Going button", () => {
  it("is one client component on the website, and one in the app", () => {
    expect(webButton).toMatch(/^"use client";/);
    expect(webButton).toContain("export function GoingButton(");
    expect(appButton).toContain("export function GoingButton(");
  });

  it("says Going off and You're going on, with the check, on both", () => {
    for (const source of [webButton, appButton]) {
      expect(source).toContain("GOING");
      expect(source).toContain("YOURE_GOING");
      expect(source).toContain("goingLine(");
      /* On: the secondary style with the check. Off: primary. */
      expect(source).toMatch(/Check|checkmark/);
    }
    expect(webButton).toContain('going ? "secondary" : "primary"');
  });

  it("sends a signed-out viewer to sign in and back, on the website", () => {
    expect(webButton).toContain("/login?next=");
  });

  it("is used everywhere a night is drawn", () => {
    expect(webNights).toContain("<GoingButton");
    expect(webPreStart).toContain("<GoingButton");
    expect(webFeedItems).toContain("<GoingButton");
    expect(webStore).toContain("<GoingButton");
    expect(appNights).toContain("<GoingButton");
    expect(appRoom).toContain("<GoingButton");
    expect(appHome).toContain("<GoingButton");
    expect(appStore).toContain("<GoingButton");
  });
});

describe("the room before its night", () => {
  it("pitches with the same two sentences on both", () => {
    expect(webPreStart).toContain("PRE_START_PITCH");
    expect(webPreStart).toContain("YOURE_ON_THE_BOARD");
    expect(appRoom).toContain("PRE_START_PITCH");
    expect(appRoom).toContain("YOURE_ON_THE_BOARD");
  });

  it("draws the pre-start view and the roster on the website", () => {
    expect(webRoom).toContain("<PreStartRoom");
    expect(webRoom).toContain("<NightRosterCard");
    expect(webRoom).toContain('phase === "upcoming" || phase === "early"');
  });

  it("polls by phase: none upcoming, a minute early, twelve seconds live", () => {
    expect(webRoom).toContain(
      'phase === "live" ? 12_000 : phase === "early" ? 60_000 : null',
    );
    expect(webRoom).toContain("<RoomTicker intervalMs={tickerMs} />");
    expect(appRoom).toContain("60_000");
    expect(appRoom).toContain("12_000");
  });

  it("keeps the early-board card for the early phase", () => {
    expect(webRoom).toContain("This board is open early");
  });
});

describe("the console", () => {
  it("counts a night that has not started as going", () => {
    expect(webEventList).toContain('event.status === "draft"');
    expect(webEventList).toContain("goingLine(attendance.total)");
  });

  it("tells the store what the early window does and does not gate", () => {
    expect(webEarlyPicker).toContain(
      "Players can say they're going from the moment a night is posted; this is when locals who follow you get the reminder.",
    );
  });
});
