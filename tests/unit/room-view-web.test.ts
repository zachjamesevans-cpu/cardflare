import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HIDE_YOUR_FLARES,
  SHOW_YOUR_FLARES,
  yourFlaresLine,
} from "@/lib/events/room-view";

/**
 * The website's room, drawn two ways.
 *
 * The founder (2026-11-15), after scanning into a walk-in room: "When
 * someone scans into a room I feel like it should be dead simple imo.
 * This is so much info." So while the night is on (`roomViewFor` says
 * "in-room") the page is the header, the clocks, one match line, the
 * board and the + Flare button; before it, the planning dashboard of
 * 2026-10-03 stays whole. On both, the board has no filter and the
 * viewer's own Flares are folded to one line.
 *
 * These read the source for what each view draws, and render the two
 * small pieces that can be rendered without a database.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/** The source with its comments gone: a founder quote is not a block. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = read("src/app/e/[code]/page.tsx");
const header = read("src/components/events/night-header.tsx");
const door = read("src/components/events/room-door.tsx");
const lobby = read("src/components/events/event-lobby.tsx");
const flaresAtNight = read("src/components/events/flares-at-night.tsx");
const matchesForYou = read("src/components/events/matches-for-you.tsx");
const board = read("src/components/lists/list-entries.tsx");
const fold = read("src/components/lists/your-flares-fold.tsx");

const pageCode = code(page);

/** Markers in order: each present, each after the one before. */
function expectInOrder(source: string, markers: string[]) {
  const positions = markers.map((marker) => source.indexOf(marker));
  markers.forEach((marker, index) => {
    expect(positions[index], `missing ${marker}`).toBeGreaterThan(-1);
  });
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

describe("which view the page draws", () => {
  it("asks roomViewFor once, from the phase", () => {
    expect(page).toContain('import { roomViewFor } from "@/lib/events/room-view";');
    expect(page).toContain('const roomView = roomViewFor(phase) === "in-room";');
    expect(pageCode.match(/roomViewFor\(/g)).toHaveLength(1);
  });

  it("draws the room top to bottom: header, clocks, the match line, the board", () => {
    expectInOrder(pageCode, [
      "{header}",
      "{live && <RoomTimers",
      "<RoomMatchLine",
      "<FlaresAtNight",
    ]);
    /* The + Flare button is still the composer's door, for a seat. */
    expect(pageCode).toMatch(/\{poster && writable && \(\s*<RoomComposerDoor/);
  });

  it("keeps the planning blocks out of the room", () => {
    expect(pageCode).toMatch(
      /\{!roomView && accountPlayerId && night\?\.youGoing && binderState\?\.editable && \(\s*<YourBinders/,
    );
    expect(pageCode).toMatch(
      /\{!roomView && accountPlayerId && matches\.bring\.length > 0 && \(\s*<WhatToBring/,
    );
    expect(pageCode).toMatch(
      /\{!roomView && readable && scheduled && \(\s*<PlayersGoing/,
    );
    expect(pageCode).toMatch(/\{!roomView && scheduled && \(\s*<EventDetails/);
    /* Every one of them still drawn somewhere: in planning. */
    for (const block of [
      "<YourBinders",
      "<WhatToBring",
      "<PlayersGoing",
      "<EventDetails",
    ]) {
      expect(pageCode.match(new RegExp(block, "g")), block).toHaveLength(1);
    }
  });

  it("swaps Matches for you for one line in the room, and keeps the guest's pitch", () => {
    expect(pageCode).toMatch(
      /\{accountPlayerId \? \(\s*roomView \? \(\s*<RoomMatchLine summary=\{matches\.summary\} code=\{normalized\} \/>\s*\) : \(\s*<MatchesForYou/,
    );
    expect(pageCode).toMatch(/\) : \(\s*<AccountPitch/);
  });

  it("keeps the notes, the closed and pending lines, the ticker and the tour in both", () => {
    for (const marker of [
      "did not fit",
      "You were already in this room",
      '{phase === "early" && <EarlyBanner />}',
      '"Not open yet"',
      "<RoomTicker",
      '<Tour id="room" />',
      "<TradedTonight",
    ]) {
      expect(pageCode, marker).toContain(marker);
    }
  });

  it("removes no way in: the join form keeps its rule", () => {
    expect(pageCode).toMatch(
      /\{browsing && readable && \(!accountName \|\| phase === "live"\) && \(\s*<Card className="p-4">\s*<JoinEventForm/,
    );
  });
});

describe("the header and the door in the room", () => {
  it("drops the when line in the room, on both", () => {
    expect(pageCode).toMatch(
      /when=\{\s*roomView\s*\? null\s*: nightWhenLine\(event\.startsAt, event\.endsAt, event\.storeTimeZone\)/,
    );
    expect(pageCode).toMatch(
      /when=\{\s*roomView\s*\? null\s*: event\.kind === "walk_in"/,
    );
    expect(header).toContain("when: string | null;");
    expect(code(header)).toContain(
      '{when && <p className="text-sm text-text-secondary">{when}</p>}',
    );
    expect(door).toContain("when: string | null;");
    expect(code(door)).toContain("{when && (");
  });

  it("says only how many players once the viewer is in, with no Going chip", () => {
    expect(pageCode).toContain("const seated = inRoom || Boolean(night?.youGoing);");
    expect(pageCode).toContain(
      "roomCount={roomView && seated && night ? night.goingCount : null}",
    );
    /* roomCount replaces the Going line; without it the line is as it was. */
    expect(code(header)).toMatch(
      /\{roomCount !== null \? \(\s*<p[^>]*>\s*\{roomPlayersLine\(roomCount\)\}\s*<\/p>\s*\) : \(\s*line && \(\s*<p[^>]*>\s*<GoingButton/,
    );
    expect(code(lobby)).toContain("{roomPlayersLine(participants.length)}");
  });

  it("never says here now", () => {
    for (const source of [page, header, door, lobby].map(code)) {
      expect(source).not.toContain("here now");
      expect(source).not.toContain("hereNowLine");
    }
  });
});

describe("the match line", () => {
  it("is roomMatchLine as one link to the matches page, or nothing", () => {
    expect(matchesForYou).toContain("export function RoomMatchLine(");
    expect(matchesForYou).toContain("const line = roomMatchLine(summary);");
    expect(matchesForYou).toContain("if (line === null) return null;");
    /* The same page See all matches opens. */
    expect(matchesForYou.match(/href=\{`\/e\/\$\{code\}\/matches`\}/g)).toHaveLength(2);
    expect(matchesForYou).toContain("min-h-12");
  });

  it("renders the line, and nothing when nobody here matters to you", async () => {
    const { RoomMatchLine } = await import("@/components/events/matches-for-you");
    const empty = renderToStaticMarkup(
      createElement(RoomMatchLine, {
        summary: { total: 0, cardsHuntingHere: 0, playersWantYours: 0, mutual: 0 },
        code: "ABC123",
      }),
    );
    expect(empty).toBe("");

    const html = renderToStaticMarkup(
      createElement(RoomMatchLine, {
        summary: { total: 5, cardsHuntingHere: 2, playersWantYours: 3, mutual: 1 },
        code: "ABC123",
      }),
    );
    expect(html).toContain('href="/e/ABC123/matches"');
    expect(html).toContain(
      "2 cards you&#x27;re hunting are here · 3 players want cards you have",
    );
  });
});

describe("the board, in both views", () => {
  it("has no All | Hunting | Offering filter, and is drawn once", () => {
    expect(flaresAtNight).not.toContain('"use client"');
    for (const gone of [
      "FLARE_FILTER",
      "FILTER_EMPTY",
      "tablist",
      "Hunting",
      "Offering",
    ]) {
      expect(code(flaresAtNight), gone).not.toContain(gone);
    }
    expect(flaresAtNight).toContain("{FLARES_AT_THIS_NIGHT}");
    expect(pageCode).toContain("board={boardFor(flares)}");
    expect(pageCode).not.toContain("boards={");
    expect(pageCode).not.toContain('entry.intent === "showcase"');
  });

  it("renders the label, the note and the board, and nothing else", async () => {
    const { FlaresAtNight } = await import("@/components/events/flares-at-night");
    const html = renderToStaticMarkup(
      createElement(FlaresAtNight, {
        board: createElement("p", null, "the board"),
        note: createElement("p", null, "the note"),
      }),
    );
    expect(html).toContain("Flares at this night");
    expect(html).toContain('data-tour="room:board"');
    expectInOrder(html, ["Flares at this night", "the note", "the board"]);
    expect(html).not.toContain("<button");
  });

  it("folds the viewer's own group, open when somebody has offered on one", () => {
    expect(pageCode).toContain("yourFold={{ open: offersOnMine > 0 }}");
    /* The offers note links to the group the fold opens for it. */
    expect(pageCode).toContain("anchor={`#flares-${session.id}`}");
    expect(board).toContain("const headingId = `flares-${group.playerSessionId}`;");
    expect(code(board)).toMatch(
      /\{isYou && yourFold \? \(\s*<YourFlaresFold\s+count=\{entries\.length\}\s+initialOpen=\{yourFold\.open\}\s+anchorId=\{headingId\}\s*>\s*\{groupView\}\s*<\/YourFlaresFold>\s*\) : \(\s*groupView\s*\)\}/,
    );
    /* In its place on the board, still the tour's "yours" stop. */
    expect(board).toContain('tour={isYou ? "room:yours" : undefined}');
    /* Every other board (the store's, the admin's) draws it open. */
    expect(board).toContain("yourFold = null,");
  });

  it("is a small client toggle: the words from room-view.ts, 44px, tokens only", () => {
    expect(fold).toMatch(/^"use client";/);
    expect(fold).toContain("yourFlaresLine(count)");
    expect(fold).toContain("{open ? HIDE_YOUR_FLARES : SHOW_YOUR_FLARES}");
    expect(fold).toContain("aria-expanded={open}");
    expect(fold).toContain("min-h-11");
    expect(fold).toContain("useState(initialOpen)");
    /* The offers note's link opens it, even after it was hidden. */
    expect(fold).toContain('window.addEventListener("hashchange", onHash);');
    expect(fold).toContain("scrollIntoView(");
    expect(fold).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(fold).not.toContain(String.fromCharCode(0x2014));
  });

  it("renders folded with Show, and open with Hide and the group", async () => {
    const { YourFlaresFold } = await import("@/components/lists/your-flares-fold");
    const group = createElement("p", null, "Found it");

    const folded = renderToStaticMarkup(
      createElement(
        YourFlaresFold,
        {
          count: 3,
          initialOpen: false,
          anchorId: "flares-me",
        },
        group,
      ),
    );
    expect(folded).toContain(yourFlaresLine(3));
    expect(folded).toContain(`${SHOW_YOUR_FLARES}<`);
    expect(folded).toContain('aria-expanded="false"');
    expect(folded).toMatch(/hidden=""[^>]*class="hidden"/);

    const opened = renderToStaticMarkup(
      createElement(
        YourFlaresFold,
        {
          count: 1,
          initialOpen: true,
          anchorId: "flares-me",
        },
        group,
      ),
    );
    expect(opened).toContain("Your 1 Flare is up");
    expect(opened).toContain(`${HIDE_YOUR_FLARES}<`);
    expect(opened).toContain('aria-expanded="true"');
    expect(opened).not.toMatch(/hidden=""/);
    expect(opened).toContain("Found it");
  });
});

describe("the files", () => {
  it("use tokens only and no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const source of [
      page,
      header,
      door,
      lobby,
      flaresAtNight,
      matchesForYou,
      fold,
    ]) {
      expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source).not.toContain(emDash);
    }
  });
});
