import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as copy from "../../mobile/src/night-copy";

/**
 * Nights round 2 in the app: the trading dashboard, read off the
 * source.
 *
 * The founder (2026-10-03): "Do NOT make Nights feel like a generic
 * social media event page. It should feel like a trading dashboard.
 * The most valuable information is NOT 'Who is attending?' The most
 * valuable information is 'Who can I trade with and why?'" These pin
 * the words, the hierarchy of the night's page, the dense list with
 * its tabs and QR sheet, the two new stack screens, the optimistic
 * Packed checkbox and the floating button. The website's half is held
 * against this one by tests/unit/nights2-parity.test.ts. Nobody here
 * has a renderer; what a phone draws is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const app = read("mobile/App.tsx");
const api = read("mobile/src/api.ts");
const nights = read("mobile/src/screens/nights.tsx");
const room = read("mobile/src/screens/room.tsx");
const header = read("mobile/src/night-header.tsx");
const banner = read("mobile/src/early-banner.tsx");
const matchesForYou = read("mobile/src/matches-for-you.tsx");
const mutual = read("mobile/src/mutual-match.tsx");
const bring = read("mobile/src/what-to-bring.tsx");
const filter = read("mobile/src/flares-at-night.tsx");
const players = read("mobile/src/players-going.tsx");
const details = read("mobile/src/event-details.tsx");
const fab = read("mobile/src/flare-fab.tsx");
const section = read("mobile/src/night-section.tsx");
const matchesScreen = read("mobile/src/screens/night-matches.tsx");
const playerScreen = read("mobile/src/screens/night-player.tsx");
const copySource = read("mobile/src/night-copy.ts");

const NEW_FILES = {
  nights,
  room,
  header,
  banner,
  matchesForYou,
  mutual,
  bring,
  filter,
  players,
  details,
  fab,
  section,
  matchesScreen,
  playerScreen,
  copySource,
};

/** A pure function lifted out of a React Native file, run as written. */
function lift<T extends (...args: never[]) => unknown>(
  source: string,
  signature: RegExp,
  params: string[],
): T {
  const match = source.match(signature);
  if (!match) throw new Error(`no function matching ${signature}`);
  return new Function(...params, match[1]!) as T;
}

describe("the words", () => {
  it("say the pinned lines, word for word", () => {
    expect(copy.NIGHT_TABS).toEqual({ going: "Going", nearby: "Nearby", past: "Past" });
    expect(copy.SCAN_QR).toBe("Scan QR");
    expect(copy.ENTER_CODE).toBe("Enter event code");
    expect(copy.GOING_EMPTY).toBe(
      "You're not going to anything yet. Nearby has what's coming up.",
    );
    expect(copy.PAST_EMPTY).toBe("Nothing yet. Nights you went to land here.");
    expect(copy.BOARD_EARLY).toBe("Board open early");
    expect(copy.BOARD_EARLY_LINE).toBe("Post now so players know what to bring.");
    expect(copy.MATCHES_FOR_YOU).toBe("Matches for you");
    expect(copy.NO_MATCHES).toBe(
      "No matches yet. Post a Flare or add to your Trade binder and Cardflare keeps looking.",
    );
    expect(copy.MUTUAL_MATCH).toBe("Mutual match");
    expect(copy.MUTUAL_LINE).toBe("You may already have the pieces for a trade.");
    expect(copy.FLARE_FILTERS).toEqual({
      all: "All",
      hunting: "Hunting",
      offering: "Offering",
    });
    expect(copy.POST_A_FLARE).toBe("Post a Flare");
  });

  it("count the way the website counts", () => {
    expect(copy.playersLine(0)).toBe("Nobody yet");
    expect(copy.playersLine(1)).toBe("1 player");
    expect(copy.playersLine(18)).toBe("18 players");
    expect(copy.hereNowLine(3)).toBe("3 here now");
    expect(copy.matchesLine(1)).toBe("1 match");
    expect(copy.matchesLine(6)).toBe("6 matches");
    expect(copy.matchesForYouLine(1)).toBe("1 match for you");
    expect(copy.matchesForYouLine(7)).toBe("7 matches for you");
    expect(copy.huntingHereLine(1)).toBe("1 card you're hunting is here");
    expect(copy.huntingHereLine(4)).toBe("4 cards you're hunting are here");
    expect(copy.wantYoursLine(1)).toBe("1 player wants cards you have");
    expect(copy.wantYoursLine(3)).toBe("3 players want cards you have");
    expect(copy.bringLine(1)).toBe(
      "Players at this Night are looking for 1 card you own.",
    );
    expect(copy.bringLine(5)).toBe(
      "Players at this Night are looking for 5 cards you own.",
    );
    expect(copy.wantedByLine(["CHUNC"])).toBe("Wanted by CHUNC");
    expect(copy.wantedByLine(["Alex", "Jamie"])).toBe("Wanted by Alex + 1 other");
    expect(copy.wantedByLine(["Alex", "Jamie", "Sam"])).toBe(
      "Wanted by Alex + 2 others",
    );
    expect(copy.matchesWithYouLine(1)).toBe("1 match with you");
    expect(copy.matchesWithYouLine(2)).toBe("2 matches with you");
    expect(copy.flaresLine(1)).toBe("1 Flare");
    expect(copy.flaresLine(9)).toBe("9 Flares");
    expect(copy.tradeCardsLine(1)).toBe("1 trade card");
    expect(copy.tradeCardsLine(42)).toBe("42 trade cards");
  });

  it("have no em dash and no literal hex colour in any new file", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const [name, source] of Object.entries(NEW_FILES)) {
      expect(source, `${name} has an em dash`).not.toContain(emDash);
    }
    /* Colours come from the theme; the one exception is the alpha
       suffix the board already appends to a theme token. */
    for (const [name, source] of Object.entries(NEW_FILES)) {
      if (name === "copySource") continue;
      const hexes = source.match(/["'`]#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexes, `${name} writes a hex colour`).toEqual([]);
    }
  });
});

describe("the Nights tab", () => {
  it("is the QR icon with a two-row sheet: Scan QR to the scanner, Enter event code to the Room form", () => {
    expect(nights).toContain('icon="qr-code-outline"');
    expect(nights).toContain("label={SCAN_OR_CODE}");
    expect(nights).toMatch(
      /label: SCAN_QR,[\s\S]*?onPress: \(\) => navigation\.navigate\("Scan"\)/,
    );
    expect(nights).toMatch(
      /label: ENTER_CODE,[\s\S]*?void forgetRoom\(\)\.finally\(\(\) => openRoom\(navigation\)\)/,
    );
    expect(nights).toContain(
      'import { ActionSheet, type ActionItem } from "../action-menu";',
    );
    expect(app).toContain("headerRight: () => <NightsCodeButton />");
  });

  it("files every night under one of Going, Nearby, Past", () => {
    const tabFor = lift<(night: unknown) => string>(
      nights,
      /export function tabFor\(night: NightItem\): NightTab \{([\s\S]*?)\n\}/,
      ["night"],
    );
    expect(tabFor({ phase: "finished", youGoing: true })).toBe("past");
    expect(tabFor({ phase: "live", youGoing: true })).toBe("going");
    expect(tabFor({ phase: "upcoming", youGoing: true })).toBe("going");
    expect(tabFor({ phase: "early", youGoing: false })).toBe("nearby");
    expect(tabFor({ phase: "live", youGoing: false })).toBe("nearby");
  });

  it("draws a short card with the date block and the one line, matches outranking attendance", () => {
    expect(nights).toContain("export function dateBlock(");
    expect(nights).toContain('month: part("month").toUpperCase()');
    expect(nights).toContain('if (night.phase === "live") return "Open now";');
    expect(nights).toContain('if (night.phase === "finished") return "Ended";');
    /* Going with a check when going; the chip otherwise; nothing in Past. */
    expect(nights).toMatch(
      /\{past \? null : night\.youGoing \? \([\s\S]*?name="checkmark"[\s\S]*?\{GOING\}[\s\S]*?\) : \(\s*<GoingButton[\s\S]*?withCount=\{false\}[\s\S]*?size="chip"/,
    );
    expect(nights).toContain("{playersLine(night.goingCount)}");
    expect(nights).toMatch(
      /\{matches !== null && matches > 0 \? \([\s\S]*?name="flame"[\s\S]*?\{matchesLine\(matches\)\}/,
    );
    expect(nights).toContain("const matches = night.matches ?? null;");
  });

  it("says the three empty states", () => {
    expect(nights).toContain(
      '{tab === "going" ? GOING_EMPTY : tab === "past" ? PAST_EMPTY : NO_NIGHTS}',
    );
  });
});

describe("the night's page", () => {
  it("draws the hierarchy top to bottom, the website's order", () => {
    const order = [
      "<NightHeader",
      "<EarlyBanner />",
      "<MatchesForYou",
      "<WhatToBring",
      "label={FLARES_AT_THIS_NIGHT}",
      "<PlayersGoing",
      "<EventDetails",
      "<FlareFab",
    ];
    const at = order.map((marker) => room.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("puts attendance on the header once, with here now only live or early and above zero", () => {
    expect(header).toContain(
      'const showHereNow = hereNow > 0 && (phase === "live" || phase === "early");',
    );
    expect(header).toContain("{playersLine(playersCount)}");
    expect(room).not.toContain("Who&rsquo;s going");
    expect(room).not.toContain("tonight ·");
    expect(room).not.toContain("function RosterCard");
    expect(room).not.toContain("YOURE_ON_THE_BOARD");
  });

  it("replaces the tall early card with the one-line banner and the glyph", () => {
    expect(room).toContain('{phase === "early" ? <EarlyBanner /> : null}');
    expect(room).not.toContain("This board is open early");
    expect(banner).toContain("{BOARD_EARLY}");
    expect(banner).toContain("{`. ${BOARD_EARLY_LINE}`}");
    expect(banner).toContain("{BOARD_EARLY_LONG}");
    expect(banner).toMatch(
      /name=\{open \? "information-circle" : "information-circle-outline"\}/,
    );
  });

  it("keeps the two shut doors as lines under the header", () => {
    expect(room).toContain('{finished ? "This room has closed" : "Not open yet"}');
    expect(room).toContain(
      "The store has not opened this room yet. Scan the code again when it starts.",
    );
    expect(room).toContain("This room has closed. Thanks for coming.");
  });

  it("draws Matches for you for a signed-in viewer, the pitch for a guest, nothing when finished", () => {
    expect(room).toMatch(
      /\{guest \? \(\s*finished \? null : \(\s*<AccountPitch variant=\{joined \? "room" : "join"\} \/>\s*\)\s*\) : eventId && !finished \? \(\s*<MatchesForYou/,
    );
    expect(room).toContain(
      'onSeeAll={() => navigation.navigate("NightMatches", { code })}',
    );
    expect(matchesForYou).toContain("{NO_MATCHES}");
    expect(matchesForYou).toContain("{matchesForYouLine(total)}");
    expect(matchesForYou).toContain(
      "{huntingHereLine(matches.summary.cardsHuntingHere)}",
    );
    expect(matchesForYou).toContain(
      "{wantYoursLine(matches.summary.playersWantYours)}",
    );
    expect(matchesForYou).toContain("{SEE_ALL_MATCHES}");
    expect(matchesForYou).toContain("export const MUTUAL_INLINE = 3;");
    expect(matchesForYou).toContain("mutual.slice(0, MUTUAL_INLINE)");
  });

  it("re-reads the matches on open, on a pull, on Going, and otherwise once a minute", () => {
    expect(room).toContain("const MATCHES_REFRESH_MS = 60_000;");
    expect(room).toContain(
      "options?.matches || Date.now() - matchesAt.current >= MATCHES_REFRESH_MS",
    );
    expect(room).toContain("setMatches(await getNightMatches(eventId));");
    expect(room).toContain("onSettled={() => void refresh({ matches: true })}");
    expect(room).toMatch(
      /onRefresh=\{\(\) => \{[\s\S]*?refresh\(\{ matches: true \}\)/,
    );
  });

  it("makes the mutual match block stand out: accent border, the flame, two thumbnail rows, Message", () => {
    expect(mutual).toContain("borderColor: colors.accent");
    expect(mutual).toContain('name="flame"');
    expect(mutual).toContain("{MUTUAL_MATCH}");
    expect(mutual).toContain("<ThumbRow label={YOU_WANT} cards={match.youWant} />");
    expect(mutual).toContain("<ThumbRow label={THEY_WANT} cards={match.theyWant} />");
    expect(mutual).toContain("{MUTUAL_LINE}");
    expect(mutual).toContain("label={`Message ${player.displayName}`}");
    /* Message opens the one direct thread, the profile's way; a guest
       is sent to sign in. */
    expect(mutual).toContain("const result = await openDirectThread(playerId);");
    expect(mutual).toContain(
      'navigation.navigate("LocalThread", { threadId: result.threadId });',
    );
    expect(mutual).toContain('navigation.navigate("SignIn");');
  });

  it("draws What to bring only with something to pack, three inline, Packed persisted optimistically", () => {
    expect(room).toContain("{!guest && eventId && !finished && bring.length > 0 ? (");
    expect(bring).toContain("export const BRING_INLINE = 3;");
    expect(bring).toContain("rows(bring.slice(0, BRING_INLINE))");
    expect(bring).toContain("{VIEW_LIST}");
    expect(bring).toContain("<SheetBackdrop />");
    expect(bring).toContain("{bringLine(bring.length)}");
    expect(bring).toContain("{wantedByLine(row.wantedBy)}");
    /* Painted at once, written to the server, painted back on a refusal. */
    expect(bring).toMatch(
      /setPackedState\(\(current\) => \(\{ \.\.\.current, \[cardId\]: next \}\)\);\s*try \{\s*await setPacked\(eventId, cardId, next\);\s*\} catch \{\s*setPackedState\(\(current\) => \(\{ \.\.\.current, \[cardId\]: before \}\)\);/,
    );
  });

  it("filters Flares at this Night on the phone and keeps the board as it was", () => {
    const filterFlares = lift<(flares: { intent: string }[], f: string) => unknown[]>(
      filter,
      /export function filterFlares<[^>]*>\(\s*flares: T\[\],\s*filter: FlareFilter,\s*\): T\[\] \{([\s\S]*?)\n\}/,
      ["flares", "filter"],
    );
    const board = [{ intent: "want" }, { intent: "showcase" }, { intent: "want" }];
    expect(filterFlares(board, "all")).toHaveLength(3);
    expect(filterFlares(board, "hunting")).toEqual([
      { intent: "want" },
      { intent: "want" },
    ]);
    expect(filterFlares(board, "offering")).toEqual([{ intent: "showcase" }]);
    expect(filter).toContain(
      'export const FLARE_FILTER_ORDER: FlareFilter[] = ["all", "hunting", "offering"];',
    );
    expect(room).toContain("const flares = filterFlares(state.flares ?? [], filter);");
    /* The tiles and the offer flow are untouched. */
    expect(room).toContain("function CarouselFlare(");
    expect(room).toContain("function FlareRow(");
    expect(room).toContain("offerOnFlare(code, flare.id, message, quantity)");
    expect(room).toContain("<ReadOnlyBoard flares={flares} filter={filter} />");
  });

  it("draws Players going as compact rows that open the event-facing profile", () => {
    expect(players).toContain("flaresLine(p.flares)");
    expect(players).toContain("tradeCardsLine(p.tradeCards)");
    expect(players).toContain("{matchesLine(matches)}");
    expect(players).toContain(
      "p.matches ?? (p.playerId ? (matchesByPlayer[p.playerId] ?? 0) : 0)",
    );
    expect(room).toContain('navigation.navigate("NightPlayer", { code, playerId });');
    expect(room).toContain("matchesByPlayer={matchesByPlayer}");
  });

  it("folds Event details shut with the four rows", () => {
    expect(details).toContain("const [open, setOpen] = useState(false);");
    for (const label of ['"Venue"', '"Address"', '"Organizer"', '"Event code"']) {
      expect(details).toContain(`label: ${label}`);
    }
    expect(room).toContain("address={room.store?.address ?? null}");
  });

  it("floats + Flare for a seat in a writable phase, in place of the lime bar", () => {
    expect(room).toContain("{joined && writable ? (");
    expect(room).toMatch(
      /const writable =\s*phase === null\s*\? room\.status === "open" \|\| room\.early\s*: phase === "live" \|\| phase === "early";/,
    );
    expect(room).not.toContain("styles.actionBar");
    expect(fab).toContain("accessibilityLabel={POST_A_FLARE}");
    expect(fab).toContain('name="add"');
    expect(fab).toContain("backgroundColor: colors.accent");
  });

  it("divides sections with labels and hairlines, not a card each", () => {
    expect(section).toContain("export function SectionLabel(");
    expect(section).toContain("export function Hairline()");
    expect(section).toContain('textTransform: "uppercase"');
    expect(section).toContain("letterSpacing: 1.4");
    /* The night's page draws no Card of its own past the way in. */
    const page = room.slice(room.indexOf("THE HEADER"), room.indexOf("<FlareFab"));
    expect(page.match(/<Card>/g) ?? []).toHaveLength(1);
  });
});

describe("the two new screens", () => {
  it("are on the stack, reached by code", () => {
    expect(app).toContain("NightMatches: { code: string };");
    expect(app).toContain("NightPlayer: { code: string; playerId: string };");
    expect(app).toMatch(/<Stack\.Screen\s+name="NightMatches"/);
    expect(app).toMatch(/<Stack\.Screen\s+name="NightPlayer"/);
    expect(app).toContain("<NightMatchesScreen code={route.params.code} />");
    expect(app).toMatch(
      /<NightPlayerScreen\s+code=\{route\.params\.code\}\s+playerId=\{route\.params\.playerId\}/,
    );
  });

  it("See all matches: mutual blocks first, then they have, then they want", () => {
    const order = [
      "<MutualMatchBlock",
      "label={THEY_HAVE_WHAT_YOU_WANT}",
      "label={THEY_WANT_WHAT_YOU_HAVE}",
    ];
    const at = order.map((marker) => matchesScreen.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(matchesScreen).toContain("note: fromYourFlare ? FROM_YOUR_FLARE : null,");
    expect(matchesScreen).toContain("note: IN_YOUR_BINDER,");
    expect(matchesScreen).toContain('lead: "Has"');
    expect(matchesScreen).toContain('lead: "Looking for"');
    expect(matchesScreen).toContain("<MessageButton");
    expect(matchesScreen).toContain('<AccountPitch variant="join" />');
  });

  it("the event-facing profile: matches with you, they have, they want, Message, Flares, trade binders only", () => {
    const order = [
      "{matchesWithYouLine(view.matches)}",
      "label={THEY_HAVE}",
      "label={THEY_WANT}",
      "<MessageButton",
      "label={ACTIVE_FLARES}",
      "label={TRADE_BINDERS}",
    ];
    const at = order.map((marker) => playerScreen.indexOf(marker));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(playerScreen).toMatch(/<BinderList[\s\S]*?yours=\{false\}/);
    expect(playerScreen).toContain("getNightPlayer(night.eventId, playerId)");
    expect(playerScreen).toContain("Not on this night's roster");
  });
});

describe("the API client", () => {
  it("has the three new calls against the contract", () => {
    expect(api).toMatch(
      /export const getNightMatches = \(eventId: string\) =>\s*call<NightMatches>\("GET", `\/api\/v1\/nights\/\$\{encodeURIComponent\(eventId\)\}\/matches`\);/,
    );
    expect(api).toMatch(
      /export const setPacked = \(eventId: string, cardId: string, packed: boolean\) =>\s*call<\{ ok: true \}>\("PUT", `\/api\/v1\/nights\/\$\{encodeURIComponent\(eventId\)\}\/packed`, \{\s*cardId,\s*packed,\s*\}\);/,
    );
    expect(api).toMatch(
      /export const getNightPlayer = \(eventId: string, playerId: string\) =>\s*call<NightPlayerView>\(\s*"GET",\s*`\/api\/v1\/nights\/\$\{encodeURIComponent\(eventId\)\}\/players\/\$\{encodeURIComponent\(playerId\)\}`,\s*\);/,
    );
  });

  it("carries the contract's shapes, with the new fields optional on the old ones", () => {
    for (const name of [
      "MatchCard",
      "MatchPlayer",
      "TheyHaveMatch",
      "TheyWantMatch",
      "MutualMatch",
      "BringCard",
      "NightMatches",
      "NightPlayerView",
    ]) {
      expect(api).toContain(`export interface ${name} {`);
    }
    expect(api).toContain("export const EMPTY_MATCHES: NightMatches = {");
    expect(api).toContain("perPlayer: Record<string, number>;");
    const roster = api.slice(
      api.indexOf("export interface RosterPlayer"),
      api.indexOf("export interface RoomState"),
    );
    expect(roster).toContain("tradeCards?: number;");
    expect(roster).toContain("matches?: number;");
    const roomShape = api.slice(
      api.indexOf("export interface RoomState"),
      api.indexOf("export const getRoom"),
    );
    expect(roomShape).toContain("hereNow?: number;");
    expect(roomShape).toMatch(
      /store\?: \{\s*address: string \| null;\s*phone: string \| null;\s*website: string \| null;\s*\};/,
    );
  });
});
