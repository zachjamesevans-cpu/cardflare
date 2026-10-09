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
 * Nights in the app, read off the source.
 *
 * Round 1 (2026-10-03): "What if, you just say you're going to an
 * event. Or a tournament night. That room stays 'open' and anyone can
 * go into there and see who is looking for which cards before the
 * tournament or event starts." And on the dock: "Trying to keep our
 * tabs to our 'hero's'." So Room's tab slot is Nights, Going is one
 * button used everywhere, and the room opens before the night does.
 *
 * Round 2, the same day: "Redesign to be much denser and more useful"
 * and "It should feel like a trading dashboard." The tab is the QR
 * icon, Going | Nearby | Past, and short cards; the room is one
 * compact header with the matches under it. tests/unit/app-nights2
 * .test.ts pins that hierarchy; these pin the tab, the button's two
 * words, the poll by phase and `goingLine`. Nobody here has a
 * renderer; what a phone draws is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const app = read("mobile/App.tsx");
const nights = read("mobile/src/screens/nights.tsx");
const button = read("mobile/src/going-button.tsx");
const header = read("mobile/src/night-header.tsx");
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
  it("gives Room's slot to Nights, labelled Rooms, with the storefront glyphs and the QR icon", () => {
    /* Store days (2026-10-09): the route keeps its name, the label and
       the glyph say Rooms. */
    expect(app).toMatch(/LOCAL_ENABLED \? \(\s*<Tab\.Screen name="Local"/);
    expect(app).toContain('<Tab.Screen\n          name="Nights"');
    expect(app).toMatch(
      /options=\{\{\s*title: "Rooms",\s*tabBarLabel: "Rooms",\s*headerRight: \(\) => <NightsCodeButton \/>,\s*\}\}/,
    );
    expect(app).toContain(
      'Nights: { idle: "storefront-outline", focused: "storefront" }',
    );
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
  it("has the three tabs, Going first and by default", () => {
    expect(nights).toContain(
      'export const TAB_ORDER: NightTab[] = ["going", "nearby", "past"];',
    );
    expect(nights).toContain('export const DEFAULT_TAB: NightTab = "going";');
    expect(nights).toContain("useState<NightTab>(DEFAULT_TAB)");
    /* The old three sections are gone with their headings. */
    expect(nights).not.toContain('"Live now"');
    expect(nights).not.toContain('"Coming up"');
    expect(nights).not.toContain("SECTION_ORDER");
  });

  it("files a finished night in Past, a Going one in Going, the rest in Nearby", () => {
    expect(nights).toMatch(
      /if \(phaseOf\(night, now\) === "finished"\) return "past";\s*if \(night\.youGoing\) return "going";\s*return "nearby";/,
    );
  });

  it("draws the card: date block, name, store with Verified, start, the one line; the card opens the night", () => {
    expect(nights).toContain("dateBlock(night.startsAt, night.timeZone)");
    expect(nights).toContain("{night.name}");
    expect(nights).toContain("{night.storeName}");
    expect(nights).toContain("night.storeVerified ? <VerifiedMark size={14} /> : null");
    expect(nights).toContain("{startLine(night)}");
    expect(nights).toContain("{playersLine(night.goingCount)}");
    expect(nights).toContain("{matchesLine(matches)}");
    expect(nights).toContain("<GoingButton");
    expect(nights).toContain("await rememberRoom(night.code);");
  });

  it("says each tab's empty state and keeps the Feed door on Nearby", () => {
    expect(nights).toContain(
      '{tab === "going" ? GOING_EMPTY : tab === "past" ? PAST_EMPTY : NO_NIGHTS}',
    );
    expect(nights).toContain('params: { tab: "nearby", at: Date.now() },');
  });

  it("keeps the code door behind the QR icon, named the old way for a screen reader", () => {
    expect(nights).toContain("export function NightsCodeButton()");
    /* The header's own button: the label is what VoiceOver reads, the
       QR glyph is all that is drawn. No worded button in the page. */
    expect(nights).toContain(
      '<HeaderButton icon="qr-code-outline" label={SCAN_OR_CODE} onPress={open} />',
    );
    expect(nights).not.toMatch(/<Button\s+label=\{SCAN_OR_CODE\}/);
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

  it("is the one button, used on the night's header, the Feed, the store and the list", () => {
    for (const source of [home, store, nights]) {
      expect(source).toContain('import { GoingButton } from "../going-button";');
    }
    expect(header).toContain('import { GoingButton } from "./going-button";');
    expect(header).toContain("<GoingButton");
    /* The room draws the header, and the header draws the button. */
    expect(room).toContain('import { NightHeader } from "../night-header";');
    expect(room).toContain("<NightHeader");
  });
});

describe("the room and its night", () => {
  it("polls by phase: twelve seconds live, sixty early, never upcoming", () => {
    expect(room).toMatch(/const POLL_MS: Record<RoomPhase, number \| null> = \{/);
    expect(room).toContain("live: 12_000,");
    expect(room).toContain("early: 60_000,");
    expect(room).toContain("upcoming: null,");
    expect(room).toContain("const pollMs = pollMsFor(phase);");
    expect(room).toContain("if (pollMs === null) return;");
    expect(room).not.toContain("const POLL_MS = 12_000;");
  });

  it("has lost the round-1 pre-start card, the roster card and the on-the-board card", () => {
    expect(room).not.toContain("function PreStartRoom");
    expect(room).not.toContain("function RosterCard");
    expect(room).not.toContain("PRE_START_PITCH");
    expect(room).not.toContain("YOURE_ON_THE_BOARD");
    expect(room).not.toContain("Who&rsquo;s going");
    /* The board to read survives, under the same filter as the board
       to write on. */
    expect(room).toContain("function ReadOnlyBoard");
    expect(room).toContain("<ReadOnlyBoard flares={flares} filter={filter} />");
  });

  it("says Going on the header line, as a chip off and a check on", () => {
    expect(header).toMatch(
      /going\.youGoing \? \(\s*<GoingMark eventId=\{eventId\} onSettled=\{onSettled\} \/>\s*\) : \(\s*<GoingButton/,
    );
    expect(header).toContain('size="chip"');
    expect(header).toContain("withCount={false}");
    expect(header).toContain("await setGoing(eventId, false);");
    expect(header).toContain("{GOING}");
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
      /export async function setGoing\(eventId: string, going: boolean\): Promise<GoingAnswer> \{\s*const result = await call<GoingAnswer & \{ sessionToken\?: string \}>\(\s*going \? "POST" : "DELETE",\s*`\/api\/v1\/nights\/\$\{encodeURIComponent\(eventId\)\}\/going`,/,
    );
  });

  it("knows a finished night and the card's two new numbers", () => {
    expect(api).toContain(
      'export type NightPhase = "live" | "early" | "upcoming" | "finished";',
    );
    const night = api.slice(
      api.indexOf("export interface NightItem"),
      api.indexOf("export const getNights"),
    );
    expect(night).toContain("matches?: number | null;");
    expect(night).toContain("hereNow?: number;");
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
