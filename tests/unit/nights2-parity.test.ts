import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as webCopy from "@/lib/events/night-copy";

/**
 * Nights, round 2: the trading dashboard, on both platforms, in the
 * same round.
 *
 * The founder (2026-10-03): "Do NOT make Nights feel like a generic
 * social media event page. It should feel like a trading dashboard.
 * The most valuable information is NOT 'Who is attending?' The most
 * valuable information is 'Who can I trade with and why?'"
 *
 * His standing instruction is that every change ships to the website
 * and the app alike: same sections, same wording, same buttons, same
 * order. This reads both sources and holds the words, the hierarchy,
 * the tabs, the QR sheet, the floating button and the one-attendance
 * rule to one another, so a platform cannot drift quietly. Whether
 * either one looks right is the visual pass.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/**
 * The source with its comments gone, for the pins that say a thing is
 * NOT drawn: a doc comment quoting the founder on the old "Who's
 * going" card is not the card.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * The app's copy file, run as written: transpiled from TypeScript and
 * evaluated as a module, so its functions are tested and not just read.
 */
function loadModule(source: string): Record<string, unknown> {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}

const webCopySource = read("src/lib/events/night-copy.ts");
const appCopySource = read("mobile/src/night-copy.ts");
const appCopy = loadModule(appCopySource);

const web = {
  nightsPage: read("src/app/nights/page.tsx"),
  nightList: read("src/components/nights/night-list.tsx"),
  nightsTabs: read("src/components/nights/nights-tabs.tsx"),
  nightCard: read("src/components/nights/night-card.tsx"),
  codeSheet: read("src/components/nights/code-sheet.tsx"),
  goingButton: read("src/components/nights/going-button.tsx"),
  room: read("src/app/e/[code]/page.tsx"),
  matchesPage: read("src/app/e/[code]/matches/page.tsx"),
  playerPage: read("src/app/e/[code]/p/[playerId]/page.tsx"),
  header: read("src/components/events/night-header.tsx"),
  earlyBanner: read("src/components/events/early-banner.tsx"),
  matchesForYou: read("src/components/events/matches-for-you.tsx"),
  mutualMatch: read("src/components/events/mutual-match.tsx"),
  whatToBring: read("src/components/events/what-to-bring.tsx"),
  flaresAtNight: read("src/components/events/flares-at-night.tsx"),
  playersGoing: read("src/components/events/players-going.tsx"),
  eventDetails: read("src/components/events/event-details.tsx"),
  flareFab: read("src/components/events/flare-fab.tsx"),
  composerDoor: read("src/components/events/room-composer-door.tsx"),
  nightPlayer: read("src/components/events/night-player.tsx"),
  matchList: read("src/components/events/match-list.tsx"),
  preStart: read("src/components/events/pre-start-room.tsx"),
};

const app = {
  root: read("mobile/App.tsx"),
  nights: read("mobile/src/screens/nights.tsx"),
  room: read("mobile/src/screens/room.tsx"),
  header: read("mobile/src/night-header.tsx"),
  earlyBanner: read("mobile/src/early-banner.tsx"),
  matchesForYou: read("mobile/src/matches-for-you.tsx"),
  mutualMatch: read("mobile/src/mutual-match.tsx"),
  whatToBring: read("mobile/src/what-to-bring.tsx"),
  flaresAtNight: read("mobile/src/flares-at-night.tsx"),
  playersGoing: read("mobile/src/players-going.tsx"),
  eventDetails: read("mobile/src/event-details.tsx"),
  flareFab: read("mobile/src/flare-fab.tsx"),
  nightMatches: read("mobile/src/screens/night-matches.tsx"),
  nightPlayer: read("mobile/src/screens/night-player.tsx"),
};

/** The exact strings the brief pins, by the constant that carries each. */
const PINNED = {
  SCAN_QR: "Scan QR",
  ENTER_CODE: "Enter event code",
  GOING_EMPTY: "You're not going to anything yet. Nearby has what's coming up.",
  PAST_EMPTY: "Nothing yet. Nights you went to land here.",
  BOARD_EARLY: "You can post already",
  BOARD_EARLY_LINE: "Post now so players know what to bring.",
  BOARD_EARLY_LONG:
    "Everyone here is still on their way. Post what you're looking for now, so people know what to bring from home. Flares from players who never make it are cleared when the event ends.",
  MATCHES_FOR_YOU: "Matches for you",
  SEE_ALL_MATCHES: "See all matches",
  NO_MATCHES:
    "No matches yet. Post a Flare or add to your trade binder and cardflare keeps looking.",
  MUTUAL_MATCH: "Mutual match",
  YOU_WANT: "You want",
  THEY_WANT: "They want",
  THEY_HAVE: "They have",
  MUTUAL_LINE: "You may already have the pieces for a trade.",
  THEY_HAVE_WHAT_YOU_WANT: "They have what you want",
  THEY_WANT_WHAT_YOU_HAVE: "They want what you have",
  FROM_YOUR_FLARE: "You posted a Flare for this",
  IN_YOUR_BINDER: "In your trade binder",
  WHAT_TO_BRING: "What to bring",
  PACKED: "Packed",
  VIEW_LIST: "View list",
  FLARES_AT_THIS_NIGHT: "Flares at this night",
  PLAYERS_GOING: "Players going",
  EVENT_DETAILS: "Event details",
  POST_A_FLARE: "Post a Flare",
  ACTIVE_FLARES: "Active Flares",
  TRADE_BINDERS: "Trade binders",
} as const;

const PINNED_OBJECTS = {
  NIGHT_TABS: { going: "Going", nearby: "Nearby", past: "Past" },
  FLARE_FILTERS: { all: "All", hunting: "Hunting", offering: "Offering" },
} as const;

/** Every line function, with the inputs the brief spells out. */
const LINES: Record<string, [unknown, string][]> = {
  playersLine: [
    [0, "Nobody yet"],
    [1, "1 player"],
    [18, "18 players"],
  ],
  hereNowLine: [
    [1, "1 here now"],
    [3, "3 here now"],
  ],
  matchesLine: [
    [1, "1 match"],
    [6, "6 matches"],
  ],
  matchesForYouLine: [
    [1, "1 match for you"],
    [7, "7 matches for you"],
  ],
  huntingHereLine: [
    [1, "1 card you're hunting is here"],
    [4, "4 cards you're hunting are here"],
  ],
  wantYoursLine: [
    [1, "1 player wants cards you have"],
    [3, "3 players want cards you have"],
  ],
  bringLine: [
    [1, "Players at this night are looking for 1 card you own."],
    [5, "Players at this night are looking for 5 cards you own."],
  ],
  wantedByLine: [
    [["CHUNC"], "Wanted by CHUNC"],
    [["Alex", "Jamie"], "Wanted by Alex + 1 other"],
    [["Alex", "Jamie", "Kai"], "Wanted by Alex + 2 others"],
  ],
  matchesWithYouLine: [
    [1, "1 match with you"],
    [2, "2 matches with you"],
  ],
  flaresLine: [
    [1, "1 Flare"],
    [9, "9 Flares"],
  ],
  tradeCardsLine: [
    [1, "1 trade card"],
    [42, "42 trade cards"],
  ],
};

/** Markers in order: each must be present and come after the one before. */
function expectInOrder(source: string, markers: string[], label: string) {
  const positions = markers.map((marker) => source.indexOf(marker));
  markers.forEach((marker, index) => {
    expect(positions[index], `${label} is missing ${marker}`).toBeGreaterThan(-1);
  });
  expect(
    [...positions].sort((a, b) => a - b),
    `${label} draws out of order`,
  ).toEqual(positions);
}

describe("the words on a Night", () => {
  /* The store's cancel confirm is console copy: the app has no store
     console, so those two names are the website's alone (round 17). */
  const WEB_ONLY = new Set(["CANCEL_EMPTY", "CANCEL_JOINED"]);

  it("export the same names on both platforms", () => {
    expect(Object.keys(appCopy).sort()).toEqual(
      Object.keys(webCopy)
        .filter((name) => !WEB_ONLY.has(name))
        .sort(),
    );
  });

  it("are the pinned strings on the website and in the app, word for word", () => {
    const webAny = webCopy as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(PINNED)) {
      expect(webAny[name], `web ${name}`).toBe(value);
      expect(appCopy[name], `app ${name}`).toBe(value);
    }
    for (const [name, value] of Object.entries(PINNED_OBJECTS)) {
      expect(webAny[name], `web ${name}`).toEqual(value);
      expect(appCopy[name], `app ${name}`).toEqual(value);
      /* The same order too: the tabs and the filters are drawn from it. */
      expect(Object.keys(webAny[name] as object)).toEqual(Object.keys(value));
      expect(Object.keys(appCopy[name] as object)).toEqual(Object.keys(value));
    }
  });

  it("count the same way on both, run as written", () => {
    const webAny = webCopy as unknown as Record<string, (input: never) => string>;
    for (const [name, samples] of Object.entries(LINES)) {
      const webFn = webAny[name];
      const appFn = appCopy[name] as (input: never) => string;
      expect(typeof webFn, `web ${name}`).toBe("function");
      expect(typeof appFn, `app ${name}`).toBe("function");
      for (const [input, line] of samples) {
        expect(webFn(input as never), `web ${name}(${JSON.stringify(input)})`).toBe(
          line,
        );
        expect(appFn(input as never), `app ${name}(${JSON.stringify(input)})`).toBe(
          line,
        );
      }
    }
  });

  it("have no em dash, no server-only import and no hex colour", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const source of [webCopySource, appCopySource]) {
      expect(source).not.toContain(emDash);
      expect(source).not.toMatch(/import ["']server-only["']/);
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe("the Nights landing", () => {
  it("is Nights with the small QR icon at its right, on both", () => {
    expect(web.nightList).toContain(">Rooms</h2>");
    expect(web.nightList).toContain("<CodeSheet />");
    expect(web.nightsPage).toContain('title="Rooms"');
    /* The icon is lucide QrCode / Ionicons qr-code-outline, labelled
       "Scan or enter a code" on both. */
    expect(web.codeSheet).toMatch(
      /import \{[^}]*\bQrCode\b[^}]*\} from "lucide-react"/,
    );
    expect(web.codeSheet).toContain("aria-label={SCAN_OR_CODE}");
    expect(app.nights).toContain('"qr-code-outline"');
    expect(app.nights).toContain("SCAN_OR_CODE");
  });

  it("opens a sheet: Enter event code to /room on the web, Scan QR and Enter event code in the app", () => {
    expect(web.codeSheet).toMatch(/^"use client";/);
    expect(web.codeSheet).toContain('import { Sheet } from "@/components/ui/sheet"');
    expect(web.codeSheet).toContain("ENTER_CODE");
    expect(web.codeSheet).toContain('href="/room"');
    /* No camera on the website, so no "Scan QR" row that could not scan. */
    expect(web.codeSheet).not.toContain("SCAN_QR");
    expect(app.nights).toContain("SCAN_QR");
    expect(app.nights).toContain("ENTER_CODE");
  });

  it("draws Going | Nearby | Past in that order, Going first, on both", () => {
    expect(web.nightList).toContain(
      'NIGHT_TAB_ORDER: NightTab[] = ["going", "nearby", "past"]',
    );
    expect(web.nightList).toContain('DEFAULT_NIGHT_TAB: NightTab = "going"');
    expect(web.nightsTabs).toMatch(/^"use client";/);
    expect(web.nightsTabs).toContain("{NIGHT_TABS[tab]}");
    expect(web.nightsTabs).toContain('role="tablist"');
    /* The tab rides in the address, replaced in place, default clean. */
    expect(web.nightsTabs).toContain("window.history.replaceState(");
    expect(web.nightsTabs).toContain('url.searchParams.set("tab", next)');
    expect(web.nightsPage).toContain("tab={nightTabFrom(tab)}");
    expect(app.nights).toContain("{NIGHT_TABS[tab]}");
  });

  it("splits Going, Nearby and Past by youGoing and finished", () => {
    expect(web.nightList).toContain(
      'going: nights.filter((night) => night.phase !== "finished" && night.youGoing)',
    );
    expect(web.nightList).toContain(
      'nearby: nights.filter((night) => night.phase !== "finished" && !night.youGoing)',
    );
    expect(web.nightList).toContain(
      'past: nights.filter((night) => night.phase === "finished")',
    );
  });

  it("says the same thing on each empty tab, on both", () => {
    for (const source of [web.nightList, app.nights]) {
      expect(source).toContain("GOING_EMPTY");
      expect(source).toContain("NO_NIGHTS");
      expect(source).toContain("PAST_EMPTY");
    }
    /* Nearby keeps its door to the Feed, where following a store happens. */
    expect(web.nightList).toContain('href="/feed?tab=nearby"');
  });

  it("draws a short card: the date block, the venue, the time, one line, on both", () => {
    expect(web.nightCard).toContain("export function dateBlock(");
    expect(web.nightCard).toContain('month: "short"');
    expect(web.nightCard).toContain('day: "2-digit"');
    for (const source of [web.nightCard, app.nights]) {
      expect(source).toContain('"Open now"');
      expect(source).toContain('"Ended"');
      expect(source).toContain("playersLine(");
      expect(source).toContain("matchesLine(");
      expect(source).toContain("<GoingButton");
      expect(source).toContain("<VerifiedMark");
    }
    /* The matches wear the flame and the accent; the chip is compact. */
    expect(web.nightCard).toContain("<Flame");
    expect(web.nightCard).toContain("text-accent");
    expect(web.nightCard).toContain("compact");
    expect(web.goingButton).toContain("compact?: boolean");
    expect(app.nights).toContain('"flame"');
    /* Nothing to RSVP to on a night that has ended. */
    expect(web.nightCard).toContain("{!past && (");
  });
});

describe("the night page", () => {
  const HIERARCHY = [
    "<NightHeader",
    "<EarlyBanner",
    "<MatchesForYou",
    "<WhatToBring",
    "<FlaresAtNight",
    "<PlayersGoing",
    "<EventDetails",
  ];

  it("draws the same sections in the same order on both", () => {
    expectInOrder(web.room, HIERARCHY, "the website's night page");
    /* The app draws the Flares section's filter row in place of a
       wrapper, with the board's own rows under it; the same slot. */
    expectInOrder(
      app.room,
      HIERARCHY.map((marker) =>
        marker === "<FlaresAtNight" ? "<FlareFilterRow" : marker,
      ),
      "the app's room screen",
    );
  });

  it("says attendance once, on the header line, and nowhere else", () => {
    /* Store days (2026-10-09): no "here now" on either header; it
       counted people looking at the room from home. */
    for (const source of [web.header, app.header]) {
      expect(source).toContain("playersLine(");
      expect(source).toContain("<GoingButton");
      expect(source).not.toContain("hereNowLine(");
    }
    expect(web.header).not.toContain("hereNowLine(");
    expect(web.header).not.toContain("hereNow");
    expect(web.room).not.toContain("hereNow");
    /* The round-1 repeats are gone from both. */
    for (const source of [web.room, web.header, web.playersGoing, web.preStart].map(
      code,
    )) {
      expect(source).not.toContain("Who's going");
      expect(source).not.toContain("Who&rsquo;s going");
      expect(source).not.toContain("tonight ·");
      expect(source).not.toContain("<PreStartCard");
      expect(source).not.toContain("<NightRosterCard");
      expect(source).not.toContain("PRE_START_PITCH");
    }
    expect(code(app.room)).not.toContain("Who's going");
    expect(code(app.room)).not.toContain("tonight ·");
    expect(code(app.room)).not.toContain("PRE_START_PITCH");
    /* The night's name is capitals by CSS, never in the data. */
    expect(web.header).toContain("uppercase");
    expect(web.header).not.toContain("toUpperCase");
  });

  it("replaces the early-board card with one line and the info toggle", () => {
    expect(web.earlyBanner).toMatch(/^"use client";/);
    expect(web.earlyBanner).toContain("aria-expanded={open}");
    for (const source of [web.earlyBanner, app.earlyBanner]) {
      expect(source).toContain("BOARD_EARLY}");
      expect(source).toContain("BOARD_EARLY_LINE");
      expect(source).toContain("BOARD_EARLY_LONG");
    }
    expect(web.room).toContain('{phase === "early" && <EarlyBanner />}');
    expect(code(web.room)).not.toContain("This board is open early");
    expect(app.earlyBanner).toContain('"information-circle');
  });

  it("puts Matches for you first, for a signed-in viewer, with See all and the no-match line", () => {
    for (const source of [web.matchesForYou, app.matchesForYou]) {
      expect(source).toContain("matchesForYouLine(");
      expect(source).toContain("huntingHereLine(");
      expect(source).toContain("wantYoursLine(");
      expect(source).toContain("SEE_ALL_MATCHES");
      expect(source).toContain("NO_MATCHES");
    }
    expect(web.matchesForYou).toContain("href={`/e/${code}/matches`}");
    expect(web.matchesForYou).toContain("export const INLINE_MUTUAL = 3;");
    expect(web.matchesForYou).toContain("slice(0, INLINE_MUTUAL)");
    expect(web.room).toMatch(/\{accountPlayerId \? \(\s*<MatchesForYou/);
    expect(web.room).toMatch(/\) : \(\s*<AccountPitch/);
    expect(web.room).toContain("nightMatches(event.id, accountPlayerId)");
  });

  it("makes a mutual match pop: accent border, the flame, two thumbnail rows, Message", () => {
    for (const source of [web.mutualMatch, app.mutualMatch]) {
      expect(source).toContain("MUTUAL_MATCH");
      expect(source).toContain("YOU_WANT");
      expect(source).toContain("THEY_WANT");
      expect(source).toContain("MUTUAL_LINE");
    }
    expect(web.mutualMatch).toContain("border-accent");
    expect(web.mutualMatch).toContain("<Flame");
    expect(web.mutualMatch).toContain("<MatchThumbs");
    expect(web.mutualMatch).toContain("label={`Message ${player.displayName}`}");
    expect(app.mutualMatch).toContain("borderColor: colors.accent");
    expect(app.mutualMatch).toContain('"flame"');
    expect(app.mutualMatch).toContain("openDirectThread(");
  });

  it("draws What to bring only with cards in it, and Packed persists on the server", () => {
    expect(web.whatToBring).toMatch(/^"use client";/);
    expect(web.whatToBring).toContain("setPackedAction(eventId, cardId, next)");
    expect(web.whatToBring).toContain('role="checkbox"');
    expect(web.whatToBring).toContain("aria-checked={on}");
    expect(web.whatToBring).toContain("export const INLINE_BRING = 3;");
    expect(web.room).toMatch(/matches\.bring\.length > 0 && \(\s*<WhatToBring/);
    for (const source of [web.whatToBring, app.whatToBring]) {
      expect(source).toContain("WHAT_TO_BRING");
      expect(source).toContain("PACKED");
      expect(source).toContain("VIEW_LIST");
      expect(source).toContain("bringLine(");
      expect(source).toContain("wantedByLine(");
    }
    expect(app.whatToBring).toContain("setPacked(eventId, cardId, next)");
  });

  it("filters Flares at this Night on the client: All | Hunting | Offering", () => {
    expect(web.flaresAtNight).toMatch(/^"use client";/);
    expect(web.flaresAtNight).toContain(
      'FLARE_FILTER_ORDER: FlareFilter[] = ["all", "hunting", "offering"]',
    );
    for (const source of [web.flaresAtNight, app.flaresAtNight]) {
      expect(source).toContain("FLARE_FILTERS[");
    }
    expect(web.flaresAtNight).toContain("FLARES_AT_THIS_NIGHT");
    expect(app.room).toContain("FLARES_AT_THIS_NIGHT");
    /* Hunting is intent "want", Offering is "showcase"; the tiles are
       the board's own, rendered on the server once per filter. */
    expect(web.room).toContain(
      'const hunting = flares.filter((entry) => entry.intent === "want");',
    );
    expect(web.room).toContain(
      'const offering = flares.filter((entry) => entry.intent === "showcase");',
    );
    expect(web.room).toMatch(
      /<RoomBoardCard[\s\S]*<FlareBoard[\s\S]*<\/RoomBoardCard>/,
    );
    expect(web.room).toContain("<ReadOnlyBoard");
    /* The offers summary is a line above the board, not a card. */
    expect(web.room).toContain("<OffersNote");
    expect(web.room).not.toContain("<MatchSummary");
  });

  it("draws Players going as rows with why each one matters, opening the night-facing profile", () => {
    for (const source of [web.playersGoing, app.playersGoing]) {
      expect(source).toContain("PLAYERS_GOING");
      expect(source).toContain("flaresLine(");
      expect(source).toContain("tradeCardsLine(");
      expect(source).toContain("matchesLine(");
    }
    expect(web.playersGoing).toContain("href={`/e/${code}/p/${player.playerId}`}");
    expect(web.playersGoing).toContain("{player.matches > 0 && (");
    expect(web.playersGoing).toContain("<Flame");
    expect(app.playersGoing).toContain('"flame"');
  });

  it("folds Event details by default: Venue, Address, Organizer, Event code", () => {
    expect(web.eventDetails).toContain("<details");
    expect(web.eventDetails).not.toContain("<details open");
    for (const source of [web.eventDetails, app.eventDetails]) {
      expect(source).toContain("EVENT_DETAILS");
      for (const label of ["Venue", "Address", "Organizer", "Event code"]) {
        expect(source).toContain(`"${label}"`);
      }
    }
  });

  it("posts from the floating + Flare button, labelled Post a Flare, for a seat in a writable phase", () => {
    expect(web.flareFab).toMatch(/^"use client";/);
    expect(web.flareFab).toContain("aria-label={POST_A_FLARE}");
    expect(web.flareFab).toContain("fixed");
    expect(web.flareFab).toMatch(/\n\s+Flare\n/);
    expect(web.composerDoor).toContain("<FlareFab onOpen={() => setOpen(true)} />");
    expect(web.composerDoor).not.toContain('size="lg"');
    expect(web.room).toMatch(/\{poster && writable && \(\s*<RoomComposerDoor/);
    expect(app.flareFab).toContain("accessibilityLabel={POST_A_FLARE}");
    expect(app.room).toContain("<FlareFab");
  });

  it("polls by phase as round 1 did: none upcoming, a minute early, twelve seconds live", () => {
    expect(web.room).toContain(
      'phase === "live" ? 12_000 : phase === "early" ? 60_000 : null',
    );
    expect(app.room).toContain("60_000");
    expect(app.room).toContain("12_000");
  });

  it("keeps a finished night's board, read-only, with no matches, no bring list and no button", () => {
    expect(web.room).toContain('const finished = phase === "finished";');
    expect(web.room).toMatch(/readable && accountPlayerId\s*\? nightMatches/);
    expect(web.room).toMatch(/\{\(readable \|\| finished\) && \(\s*<FlaresAtNight/);
    expect(web.room).toContain("if (inRoom && session && !finished) {");
    expect(web.room).toContain("{readable && scheduled && <PlayersGoing");
  });
});

describe("See all matches and the event-facing profile", () => {
  it("list the mutual matches first, then They have, then They want, on both", () => {
    expect(web.matchesPage).toContain("<MatchList");
    expectInOrder(
      web.matchList,
      ["<MutualMatchBlock", "THEY_HAVE_WHAT_YOU_WANT}", "THEY_WANT_WHAT_YOU_HAVE}"],
      "the website's match list",
    );
    for (const source of [web.matchList, app.nightMatches]) {
      expect(source).toContain("THEY_HAVE_WHAT_YOU_WANT");
      expect(source).toContain("THEY_WANT_WHAT_YOU_HAVE");
      expect(source).toContain("FROM_YOUR_FLARE");
      expect(source).toContain("IN_YOUR_BINDER");
      /* "Has: {card} {number}" and "Looking for: {card}"; the app
         carries the lead word and draws the colon after it. */
      expect(source).toMatch(/"Has:?"|Has:/);
      expect(source).toMatch(/"Looking for:?"|Looking for:/);
    }
    expect(web.matchList).toContain("<MessageButton");
    expect(app.root).toMatch(/<Stack\.Screen\s+name="NightMatches"/);
  });

  it("draw a player as the night sees them: matches with you, thumbs, Message, Flares, trade binders", () => {
    expect(web.playerPage).toContain("nightPlayer(event.id, playerId, me)");
    expect(web.playerPage).toContain("if (!view) notFound();");
    expectInOrder(
      web.nightPlayer,
      [
        "matchesWithYouLine(",
        "{THEY_HAVE}",
        "{THEY_WANT}",
        "<MessageButton",
        "{ACTIVE_FLARES}",
        "{TRADE_BINDERS}",
      ],
      "the website's night player",
    );
    for (const source of [web.nightPlayer, app.nightPlayer]) {
      expect(source).toContain("THEY_HAVE");
      expect(source).toContain("THEY_WANT");
      expect(source).toContain("ACTIVE_FLARES");
      expect(source).toContain("TRADE_BINDERS");
    }
    /* Never a private binder: the profile's own list, as a visitor. */
    expect(web.nightPlayer).toContain("<BinderList");
    expect(web.nightPlayer).toContain("yours={false}");
    expect(app.root).toMatch(/<Stack\.Screen\s+name="NightPlayer"/);
  });
});

describe("the website's files", () => {
  it("use tokens only and no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const [name, source] of Object.entries(web)) {
      expect(source, `${name} has a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, `${name} has an em dash`).not.toContain(emDash);
    }
  });

  it("keep Server Components by default: use client only where interaction forces it", () => {
    for (const name of [
      "nightList",
      "nightCard",
      "header",
      "matchesForYou",
      "mutualMatch",
      "playersGoing",
      "eventDetails",
      "nightPlayer",
      "matchList",
      "preStart",
    ] as const) {
      expect(web[name], `${name} should be a Server Component`).not.toContain(
        '"use client"',
      );
    }
    for (const name of [
      "nightsTabs",
      "codeSheet",
      "earlyBanner",
      "whatToBring",
      "flaresAtNight",
      "flareFab",
      "composerDoor",
    ] as const) {
      expect(web[name], `${name} needs interaction`).toMatch(/^"use client";/);
    }
  });
});
