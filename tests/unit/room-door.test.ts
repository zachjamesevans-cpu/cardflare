import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The room, redesigned as three things: a door card, a board and one
 * button.
 *
 * The founder, on the Room tab: "There's just so many blocks... moving
 * the remote from a big block to a small little remote icon if they
 * have access to it. It's all just disconnected and want it to flow
 * better." These pins hold the shape he approved: the store, the
 * night's name with two small round controls on its line, and the
 * pulse line that opens the people list (the walk-in door; a
 * scheduled night wears the compact header of Nights round 2, pinned
 * in tests/unit/nights2-parity.test.ts); the Flares as rows under one
 * label, with nothing of the viewer's waiting at the foot because
 * joining posted their Flares; "Post a Flare" alone, as the floating
 * "+ Flare" button, with the trades toggle inside the composer. The
 * words are the app's, exactly.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const page = read("src/app/e/[code]/page.tsx");
const door = read("src/components/events/room-door.tsx");
const lobby = read("src/components/events/event-lobby.tsx");
const board = read("src/components/events/room-board-card.tsx");
const composerDoor = read("src/components/events/room-composer-door.tsx");
const fab = read("src/components/events/flare-fab.tsx");
const flaresAtNight = read("src/components/events/flares-at-night.tsx");
const toggle = read("src/components/events/open-to-trades-toggle.tsx");

describe("the door card", () => {
  it("is one card: the store's line, the night's name, the pulse", () => {
    expect(page).toContain('import { RoomDoor } from "@/components/events/room-door"');
    expect(page).toContain("<RoomDoor");
    expect(door).not.toContain('"use client"');

    /* Line 1: the store in the accent, linking to its page, with the
       Verified mark and the Follow chip for a signed-in player. */
    expect(door).toContain("href={`/s/${storeId}`}");
    expect(door).toContain("text-accent");
    expect(door).toContain("{storeVerified && <VerifiedMark");
    expect(door).toContain("<FollowStoreButton storeId={storeId}");
    expect(door).toContain("{following !== null && (");
    expect(page).toContain("following={accountPlayerId ? followingStore : null}");

    /* Line 2: the night's name is the h1, and the icons share its line. */
    expect(door).toMatch(
      /<div className="flex items-start justify-between gap-3">\s*<h1/,
    );
    expect(door).toContain("text-2xl font-bold");
  });

  it("puts the remote and the help page on the title line as round icon buttons", () => {
    expect(door).toContain(
      'import { CalendarClock, CircleHelp, MapPin, Timer } from "lucide-react"',
    );
    expect(door).toContain('label="Timer remote"');
    expect(door).toContain('label="How a night works"');
    expect(door).toContain("aria-label={label}");
    expect(door).toContain("rounded-full border");
    /* The remote is an icon, not a card: no heading, no description. */
    expect(door).not.toContain("Open remote");
    expect(door).not.toContain("Run the round clocks");
    /* Accent ring for the remote, muted ring for help. */
    expect(door).toContain('tone="accent"');
    expect(door).toContain('tone="muted"');
    expect(door).toContain("border-accent/40 text-accent");
    expect(door).toContain("border-border text-text-secondary");
  });

  it("shows the remote only to the store's organizers, via the staff lookup", () => {
    expect(page).toContain('import { organizerStoresFor } from "@/lib/stores/staff"');
    expect(page).toContain("await organizerStoresFor(accountPlayerId)");
    expect(page).toContain(
      "organizerStores.some((store) => store.storeId === event.storeId)",
    );
    expect(page).toContain('"/store/event-hub"');
    expect(page).toContain("remoteHref={remoteHref}");
  });

  it("links help for scheduled events only, the way the text link did", () => {
    /* The scheduled night's header carries it; the walk-in door does not. */
    expect(page).toContain(
      "helpHref={`/tournaments?from=${encodeURIComponent(`/e/${normalized}`)}`}",
    );
    expect(page).toContain("helpHref={null}");
    expect(page).toContain('const scheduled = event.kind !== "walk_in";');
    /* The text link and the two badges are gone from the door. */
    expect(page).not.toContain("Here&rsquo;s how a night works");
    expect(page).not.toContain("here now");
    expect(page).not.toContain("<Badge");
  });

  it("keeps the date and the place under the night's name", () => {
    expect(door).toContain('<dt className="sr-only">When</dt>');
    expect(door).toContain('<dt className="sr-only">Where</dt>');
    expect(page).toContain('? "Trading now"');
  });

  it("makes the meta line one button named Who's here, with faces and three counts", () => {
    expect(lobby).toContain('"use client"');
    expect(lobby).toContain('aria-label="Who\'s here"');
    expect(lobby).toContain('aria-haspopup="dialog"');
    expect(lobby).toContain("{present} here now");
    expect(lobby).toContain("{participants.length} tonight");
    expect(lobby).toContain('{flareCount === 1 ? "Flare" : "Flares"}');
    /* Up to three faces, present ones first, 22px. */
    expect(lobby).toContain("const FACES = 3;");
    expect(lobby).toContain("size-[22px]");
    expect(lobby).toMatch(
      /\.\.\.participants\.filter\(\(participant\) => participant\.present\),\s*\.\.\.participants\.filter\(\(participant\) => !participant\.present\)/,
    );
    /* Bold secondary for the count that matters, muted for the rest. */
    expect(lobby).toContain("font-semibold text-text-secondary");
    expect(lobby).toContain("text-text-muted tabular-nums");
    expect(door).toContain("<EventLobby");
  });

  it("opens the people list as a Sheet titled Who's here, with the leave form", () => {
    expect(lobby).toContain('import { Sheet } from "@/components/ui/sheet"');
    expect(lobby).toContain(`title="Who's here"`);
    expect(lobby).toContain("<PlayerPeek");
    expect(lobby).toContain("<OpenToTradesTag />");
    expect(lobby).toContain(">away<");
    expect(lobby).toContain("action={leaveEventAction}");
    expect(lobby).toContain("Leave this room");
    /* The standalone "In this room" card is gone from the page. */
    expect(lobby).not.toContain("In this room");
    expect(page).not.toContain("EventLobby");
    expect(page).not.toContain("In this room");
  });
});

describe("the board", () => {
  it("is the rows under the Flares at this Night label, wrapping FlareBoard", () => {
    expect(page).toContain(
      'import { RoomBoardCard } from "@/components/events/room-board-card"',
    );
    expect(board).not.toContain('"use client"');
    /* Nights round 2: no card and no heading of its own; the label and
       the All | Hunting | Offering filter belong to the section. */
    expect(board).not.toContain("Flares in the room");
    expect(board).not.toContain('from "@/components/ui/card"');
    expect(board).not.toContain("Newest first");
    expect(flaresAtNight).toContain("FLARES_AT_THIS_NIGHT");
    expect(page).toContain("<FlaresAtNight");
    expect(page).toMatch(/<RoomBoardCard[\s\S]*<FlareBoard[\s\S]*<\/RoomBoardCard>/);
    /* Players separated by a hairline, not by cards of their own. */
    expect(board).toContain("[&>ul>li]:border-t");
    expect(board).toContain("[&>ul>li]:border-border");
    expect(board).toContain("[&>ul>li]:rounded-none");
    expect(board).toContain("[&>ul>li]:shadow-none");
  });

  it("says one secondary line when empty", () => {
    expect(board).toContain(
      '"Nothing posted yet. Yours would be the first one on the board tonight."',
    );
    expect(board).toContain('<p className="text-sm leading-5 text-text-secondary">');
    expect(page).toContain("empty={entries.length === 0 && openPlayers.length === 0}");
  });

  it("has no repost row: joining posted the viewer's Flares already", () => {
    expect(page).not.toContain("RepostWants");
    expect(page).not.toContain("outstandingWants");
    expect(page).toContain("postFlaresOnJoin(event.id, session, accountPlayerId)");
    expect(board).not.toContain("foot?: ReactNode");
    expect(board).not.toContain("{foot}");
  });

  it("gives a guest, and only a guest, the trades toggle at the foot", () => {
    expect(page).toMatch(
      /guestTrades=\{\s*accountPlayerId \? null : \(\s*<OpenToTradesToggle/,
    );
    expect(board).toContain("{guestTrades}");
  });
});

describe("the one button", () => {
  it("is Post a Flare alone, floating; the trades toggle rides in the composer's foot", () => {
    /* Nights round 2: the trigger is the floating "+ Flare" button,
       whose accessible name is still Post a Flare. */
    expect(composerDoor).toContain("<FlareFab onOpen={() => setOpen(true)} />");
    expect(fab).toContain("aria-label={POST_A_FLARE}");
    /* No `trades` prop, not in the destructuring and not in the type. */
    expect(composerDoor).not.toMatch(/\btrades\??:/);
    expect(composerDoor).not.toMatch(/^\s*trades,\s*$/m);
    expect(composerDoor).not.toContain('from "@/components/ui/card"');
    /* The door's props, up to the matches: no `trades` slot. */
    const doorBlock = page.slice(
      page.indexOf("<RoomComposerDoor"),
      page.indexOf("<MatchesForYou"),
    );
    expect(doorBlock).toContain("composer={");
    expect(doorBlock).not.toMatch(/\btrades=/);
    expect(page).toContain(
      "footer={<OpenToTradesToggle code={normalized} open={youAreOpen} />}",
    );
    expect(page).toMatch(/\{poster && writable && \(\s*<RoomComposerDoor/);
  });

  it("labels the toggle I'm open to trades / Open to trades ✓", () => {
    expect(toggle).toContain(
      `label={open ? "Open to trades ✓" : "I'm open to trades"}`,
    );
    expect(toggle).not.toContain("Never mind");
  });
});

describe("what stays, in order", () => {
  it("keeps the contextual lines after the header: timers, resumed, early, closed, then the sections", () => {
    /* Nights round 2's hierarchy; the guest's pitch sits where Matches
       for you would be, and the offers note rides inside the Flares
       section. tests/unit/nights2-parity.test.ts pins the app to it. */
    const order = [
      "<NightHeader",
      "{live && <RoomTimers",
      "You were already in this room",
      '{phase === "early" && <EarlyBanner />}',
      '{phase === "pending" ? "Not open yet" : "This room has closed"}',
      "<RoomTicker",
      "<RoomComposerDoor",
      "<MatchesForYou",
      'variant={inRoom ? "room" : "join"}',
      "<WhatToBring",
      "<FlaresAtNight",
      "<PlayersGoing",
      "<EventDetails",
      "<TradedTonight",
    ];
    const positions = order.map((marker) => page.indexOf(marker));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("keeps every data call the page made", () => {
    for (const call of [
      "listParticipants(event.id)",
      "listRoomFlares(event.id)",
      "listBinder(session!.id)",
      "listRoomOffers(event.id)",
      "listMyTrades(event.id, session!.id)",
      "roomTimersForStore(event.storeId)",
      "counterAvailability(",
      "huntsFor(accountPlayerId, accountPlayerId)",
      "hasLocal(accountPlayerId, event.storeId)",
      "collectionAvailability(",
    ]) {
      expect(page).toContain(call);
    }
  });
});

describe("a long section folds", () => {
  /*
   * The founder asked what a hundred Flares does to the room. The answer
   * was that one person's section became the board, so a section shows
   * its first six cards and "and N more" at its end; tapping that shows
   * the whole section in place, and "Show less" folds it back. The rail
   * and the stacked list both obey it, your own section folds like
   * everyone else's, and the zoom shelf is never folded: tapping a card
   * still pages the whole section. The app pins the same words in
   * tests/unit/app-room-door.test.ts.
   */
  const entries = read("src/components/lists/list-entries.tsx");
  const fold = read("src/components/lists/section-fold.tsx");

  it("names the number once, on the board, and nowhere in the wrapper", () => {
    expect(entries.match(/const SECTION_FOLD = 6;/g)).toHaveLength(1);
    expect(entries).not.toMatch(/[<>]=?\s*6\b/);
    /* The wrapper is told how many lie past the fold; it never counts
       to six on its own, so the number cannot drift between the two. */
    expect(fold).not.toContain("SECTION_FOLD");
    expect(fold).not.toMatch(/=\s*6\b/);
    expect(fold).toContain("hidden: number;");
    /* `entries` is the player's section, newest first when it is yours. */
    expect(entries).toContain("const hidden = entries.length - SECTION_FOLD;");
  });

  it("says and N more, then Show less, from one control", () => {
    expect(fold).toContain('"use client"');
    expect(fold).toContain('const label = open ? "Show less" : `and ${hidden} more`;');
    expect(fold).toContain("aria-expanded={open}");
    /* No control at all on a short section. */
    expect(fold).toContain("{hidden > 0 &&");
    expect(entries).not.toContain('"use client"');
  });

  it("folds by cards in drawn order, whatever folder they are in", () => {
    expect(entries).toContain(
      "index < SECTION_FOLD ? node : <BeyondFold key={key}>{node}</BeyondFold>;",
    );
    /* The rail counts along the shelf; the stacked list counts showcases
       first, then the wants in folder order, then the loose cards. */
    expect(entries).toContain(
      "[...showcases, ...wantEntries].map((entry, index) => [entry.id, index])",
    );
    expect(entries).toContain("{shelfEntries.map((entry, index) => (");
    expect(entries).toContain("pastFold(index, entry.id, renderTile(entry))");
    expect(entries).toContain(
      "pastFold(stackedAt.get(entry.id) ?? 0, entry.id, renderRow(entry));",
    );
    /* A folder past the fold goes whole; one straddling it keeps its
       heading and folds row by row. */
    expect(entries).toContain("stackedAt.get(folder.entries[0].id) ?? 0,");
    expect(entries).toContain("{folder.entries.map(foldRow)}");
    expect(entries).toContain("{loose.map(foldRow)}");
    expect(entries).toContain("{showcases.map(foldRow)}");
    /* The seam before the showcases folds with them. */
    expect(entries).toContain(
      'pastFold(index, "divider", <RailDivider key="divider" />)',
    );
  });

  it("folds the rail and the stacked list alike", () => {
    expect(entries).toContain('<SectionFold variant="rail" hidden={hidden}>');
    expect(entries).toContain('<SectionFold variant="stacked" hidden={hidden}>');
    /* The rail's control is a tile: the card's box, a dashed ring. */
    expect(fold).toContain('variant === "rail" ? (');
    expect(fold).toContain("aspect-[60/84]");
    expect(fold).toContain("border-dashed border-border");
    /* The stacked control is one of the board's quiet text controls. */
    expect(fold).toContain("text-sm font-semibold text-accent");
    /* Tokens only. */
    expect(fold).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("builds the zoom shelf from the whole section, never the six shown", () => {
    expect(entries).toContain(
      "const shelfEntries = [...inTileOrder(wantEntries), ...inTileOrder(showcases)];",
    );
    expect(entries).toContain("const shelf = shelfEntries.map(zoomCardFor);");
    expect(entries).toContain("siblings={shelf}");
    expect(entries).not.toMatch(/shelf(Entries)?\.slice\(/);
    expect(entries).not.toMatch(/\.slice\(0, SECTION_FOLD\)/);
  });
});
