import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GOING,
  NO_NIGHTS,
  PRE_START_PITCH,
  SCAN_OR_CODE,
  YOURE_GOING,
  YOURE_ON_THE_BOARD,
  goingLine,
} from "../../mobile/src/going-copy";

/**
 * Nights in the app, round 1, read off the source.
 *
 * The founder (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts." And on the dock: "Trying to keep our
 * tabs to our 'hero's'." So Room's tab slot is Nights, Going is one
 * button used everywhere, and the room opens before the night does.
 *
 * These pin the tab, the screen's sections, the button's two words,
 * the poll by phase and `goingLine`. tests/unit/nights-parity.test.ts
 * holds the same words against the website. Nobody here has a
 * renderer; what a phone draws is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const app = read("mobile/App.tsx");
const nights = read("mobile/src/screens/nights.tsx");
const button = read("mobile/src/going-button.tsx");
const room = read("mobile/src/screens/room.tsx");
const home = read("mobile/src/screens/home.tsx");
const store = read("mobile/src/screens/store-profile.tsx");
const api = read("mobile/src/api.ts");
const openRoom = read("mobile/src/open-room.ts");

describe("goingLine", () => {
  it("says the three forms the website says", () => {
    expect(goingLine(0)).toBe("Nobody going yet");
    expect(goingLine(1)).toBe("1 going");
    expect(goingLine(2)).toBe("2 going");
    expect(goingLine(14)).toBe("14 going");
  });

  it("carries the exact strings the parity test pins", () => {
    expect(GOING).toBe("Going");
    expect(YOURE_GOING).toBe("You're going");
    expect(SCAN_OR_CODE).toBe("Scan or enter a code");
    expect(PRE_START_PITCH).toBe(
      "See who's going and what they're hunting. Say you're going and your Flares and trade binders join the board.",
    );
    expect(YOURE_ON_THE_BOARD).toBe("You're going. Your Flares are on the board.");
    expect(NO_NIGHTS).toBe(
      "No nights near you yet. Follow a store to see its nights here.",
    );
  });
});

describe("the dock", () => {
  it("gives Room's slot to Nights, with the calendar glyphs", () => {
    expect(app).toMatch(/LOCAL_ENABLED \? \(\s*<Tab\.Screen name="Local"/);
    expect(app).toContain('<Tab.Screen\n          name="Nights"');
    expect(app).toContain('options={{ title: "Nights", tabBarLabel: "Nights" }}');
    expect(app).toContain('Nights: { idle: "calendar-outline", focused: "calendar" }');
    expect(app).not.toContain('<Tab.Screen name="Room"');
  });

  it("keeps the Room as a stack screen, reached through one door", () => {
    /* Whichever way the Local switch is set: the room is pushed over
       the tabs, and every door into it goes through openRoom. */
    expect(app).toMatch(/<Stack\.Screen\s+name="Room"\s+component=\{RoomTab\}/);
    expect(openRoom).toContain('navigation.navigate("Room");');
    expect(openRoom).not.toContain('{ screen: "Room" }');
    expect(nights).toContain("openRoom(navigation)");
  });
});

describe("the Nights screen", () => {
  it("has the three sections, in order, each only when it has rows", () => {
    expect(nights).toContain('live: "Live now"');
    expect(nights).toContain('going: "You\'re going"');
    expect(nights).toContain('coming: "Coming up"');
    expect(nights).toContain(
      'const SECTION_ORDER: SectionKey[] = ["live", "going", "coming"];',
    );
    expect(nights).toContain(".filter((section) => section.rows.length > 0)");
  });

  it("files a live room first, whatever else is true of it", () => {
    expect(nights).toMatch(
      /if \(night\.phase === "live"\) return "live";\s*if \(night\.youGoing\) return "going";\s*return "coming";/,
    );
  });

  it("draws the row: name, store with Verified, when, the button; the row opens the room", () => {
    expect(nights).toContain("{night.name}");
    expect(nights).toContain("{night.storeName}");
    expect(nights).toContain("night.storeVerified ? <VerifiedMark size={14} /> : null");
    expect(nights).toContain("whenAt(night.startsAt, night.timeZone)");
    expect(nights).toContain("<GoingButton");
    expect(nights).toContain("await rememberRoom(night.code);");
  });

  it("says the empty state and keeps the code door", () => {
    expect(nights).toContain("<Body>{NO_NIGHTS}</Body>");
    expect(nights).toContain('navigation.navigate("Tabs", { screen: "Feed" })');
    expect(nights).toContain("label={SCAN_OR_CODE}");
  });

  it("refreshes on a pull, the Feed's way", () => {
    /* The platform control does not draw in this app; see the Feed. */
    expect(nights).not.toContain("<RefreshControl");
    expect(nights).toContain("function PullSpinner");
    expect(nights).toContain("const PULL_TRIGGER");
    expect(nights).toMatch(
      /if \(pull\.value >= PULL_TRIGGER\) runOnJS\(askForRefresh\)\(\)/,
    );
  });
});

describe("the Going button", () => {
  it("says Going off and You're going on, through the shared words", () => {
    expect(button).toContain("{going ? YOURE_GOING : GOING}");
    expect(button).toContain('name="checkmark"');
    expect(button).toContain("{goingLine(count)}");
  });

  it("flips at once and paints the truth back on a refusal", () => {
    expect(button).toContain("setGoingState(next);");
    expect(button).toContain("const answer = await setGoing(eventId, next);");
    expect(button).toContain("setGoingState(answer.youGoing);");
    expect(button).toContain("setGoingState(before.going);");
  });

  it("sends a guest to sign in", () => {
    expect(button).toContain('navigation.navigate("SignIn");');
  });

  it("is the one button, used in the room, the Feed and the store", () => {
    for (const source of [room, home, store, nights]) {
      expect(source).toContain('import { GoingButton } from "../going-button";');
    }
  });
});

describe("the room before it starts", () => {
  it("polls by phase: twelve seconds live, sixty early, never upcoming", () => {
    expect(room).toMatch(/const POLL_MS: Record<RoomPhase, number \| null> = \{/);
    expect(room).toContain("live: 12_000,");
    expect(room).toContain("early: 60_000,");
    expect(room).toContain("upcoming: null,");
    expect(room).toContain("const pollMs = pollMsFor(phase);");
    expect(room).toContain("if (pollMs === null) return;");
    expect(room).not.toContain("const POLL_MS = 12_000;");
  });

  it("opens the door for a viewer who has not said Going", () => {
    expect(room).toContain(
      'const preStart = phase === "upcoming" || phase === "early";',
    );
    expect(room).toContain("if (!state.joined && preStart && going && eventId) {");
    expect(room).toContain("<Body>{PRE_START_PITCH}</Body>");
    expect(room).toContain("function RosterCard");
    expect(room).toContain("function ReadOnlyBoard");
    /* Face, name, "{k} Flares", up to three binder chips. */
    expect(room).toContain('{`${p.flares} ${p.flares === 1 ? "Flare" : "Flares"}`}');
    expect(room).toContain("p.binders.slice(0, 3)");
  });

  it("says you are on the board once you are, and not when live", () => {
    expect(room).toContain("<Body>{YOURE_ON_THE_BOARD}</Body>");
    expect(room).toMatch(
      /\{preStart && going && eventId \? \(\s*<>\s*<Card>\s*<Body>\{YOURE_ON_THE_BOARD\}/,
    );
  });

  it("reads Going from whichever place the server put it", () => {
    expect(api).toContain(
      "export function roomPhaseOf(state: RoomState): RoomPhase | null",
    );
    expect(api).toContain("export function goingOf(");
    expect(api).toContain(
      'export type RoomPhase = "upcoming" | "early" | "live" | "pending" | "finished";',
    );
  });
});

describe("the API client", () => {
  it("has the nights list and the one Going call", () => {
    expect(api).toContain(
      'export const getNights = () => call<{ nights: NightItem[] }>("GET", "/api/v1/nights");',
    );
    expect(api).toMatch(
      /export const setGoing = \(eventId: string, going: boolean\) =>\s*call<GoingAnswer>\(\s*going \? "POST" : "DELETE",\s*`\/api\/v1\/nights\/\$\{encodeURIComponent\(eventId\)\}\/going`,/,
    );
  });

  it("gives the Feed's upcoming card and the store's nights their Going fields", () => {
    const upcoming = api.slice(
      api.indexOf('kind: "upcoming";'),
      api.indexOf('kind: "recent";'),
    );
    expect(upcoming).toContain("nextEventId?: string | null;");
    expect(upcoming).toContain("goingCount?: number;");
    expect(upcoming).toContain("youGoing?: boolean;");

    const night = api.slice(
      api.indexOf("export interface UpcomingNight"),
      api.indexOf("export const getStore"),
    );
    expect(night).toContain("goingCount?: number;");
    expect(night).toContain("youGoing?: boolean;");
    expect(night).toContain("phase?: NightPhase | null;");
  });

  it("puts Going on the Feed's upcoming card and the store's nights", () => {
    expect(home).toContain("item.nextEventId && item.goingCount !== undefined ? (");
    expect(store).toContain(
      "night.goingCount !== undefined && night.phase !== null ? (",
    );
  });
});
