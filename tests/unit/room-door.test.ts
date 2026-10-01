import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The room, redesigned as three things: a door card, a board card and
 * one button.
 *
 * The founder, on the Room tab: "There's just so many blocks... moving
 * the remote from a big block to a small little remote icon if they
 * have access to it. It's all just disconnected and want it to flow
 * better." These pins hold the shape he approved: the store, the
 * night's name with two small round controls on its line, and the
 * pulse line that opens the people list; one card for the Flares with
 * the repost row at its foot; "Post a Flare" alone, with the trades
 * toggle inside the composer. The words are the app's, exactly.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const page = read("src/app/e/[code]/page.tsx");
const door = read("src/components/events/room-door.tsx");
const lobby = read("src/components/events/event-lobby.tsx");
const board = read("src/components/events/room-board-card.tsx");
const repost = read("src/components/players/repost-wants.tsx");
const composerDoor = read("src/components/events/room-composer-door.tsx");
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
    expect(page).toContain(
      "`/tournaments?from=${encodeURIComponent(`/e/${normalized}`)}`",
    );
    expect(page).toMatch(/helpHref=\{\s*event\.kind !== "walk_in"/);
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

describe("the board card", () => {
  it("is one card headed Flares in the room, wrapping FlareBoard", () => {
    expect(page).toContain(
      'import { RoomBoardCard } from "@/components/events/room-board-card"',
    );
    expect(board).not.toContain('"use client"');
    expect(board).toContain(">Flares in the room</h2>");
    expect(board).not.toContain("Newest first");
    expect(page).toMatch(/<RoomBoardCard[\s\S]*<FlareBoard[\s\S]*<\/RoomBoardCard>/);
    /* Players separated by a hairline, not by cards of their own. */
    expect(board).toContain("[&>ul>li]:border-t");
    expect(board).toContain("[&>ul>li]:border-border");
    expect(board).toContain("[&>ul>li]:rounded-none");
    expect(board).toContain("[&>ul>li]:shadow-none");
  });

  it("says one secondary line when empty, inside the card", () => {
    expect(board).toContain(
      '"Nothing posted yet. Yours would be the first one on the board tonight."',
    );
    expect(board).toContain('<p className="text-sm leading-5 text-text-secondary">');
    expect(page).toContain("empty={flares.length === 0 && openPlayers.length === 0}");
  });

  it("carries the repost foot row, which keeps its server action", () => {
    expect(page).toMatch(/foot=\{\s*outstandingWants\.length > 0 \? \(\s*<RepostWants/);
    expect(repost).toContain('"use client"');
    expect(repost).toContain("useActionState(repostWantsAction, REPOST_IDLE)");
    expect(repost).toContain('"1 card you are still after is not posted here"');
    expect(repost).toContain("cards you are still after are not posted here");
    expect(repost).toContain('{count === 1 ? "Post it" : "Post them"}');
    expect(repost).toContain("bg-elevated");
    expect(repost).toContain("aria-expanded={open}");
    /* Open, the accent text becomes a chevron. */
    expect(repost).toMatch(/\{open \? \(\s*<ChevronDown/);
    expect(repost).toContain("to this room");
    /* No longer a card of its own above the board. */
    expect(repost).not.toContain("Still looking for these");
    expect(repost).not.toContain('from "@/components/ui/card"');
  });

  it("gives a guest, and only a guest, the trades toggle at the foot", () => {
    expect(page).toMatch(
      /guestTrades=\{\s*accountPlayerId \? null : \(\s*<OpenToTradesToggle/,
    );
    expect(board).toContain("{guestTrades}");
  });
});

describe("the one button", () => {
  it("is Post a Flare alone; the trades toggle rides in the composer's foot", () => {
    expect(composerDoor).toContain("Post a Flare");
    /* No `trades` prop, not in the destructuring and not in the type. */
    expect(composerDoor).not.toMatch(/\btrades\??:/);
    expect(composerDoor).not.toMatch(/^\s*trades,\s*$/m);
    expect(composerDoor).not.toContain('from "@/components/ui/card"');
    /* The door's props, up to the board card: no `trades` slot. */
    const doorBlock = page.slice(
      page.indexOf("<RoomComposerDoor"),
      page.indexOf("<RoomBoardCard"),
    );
    expect(doorBlock).toContain("composer={");
    expect(doorBlock).not.toMatch(/\btrades=/);
    expect(page).toContain(
      "footer={<OpenToTradesToggle code={normalized} open={youAreOpen} />}",
    );
    expect(page).toMatch(/\{poster && \(\s*<RoomComposerDoor/);
  });

  it("labels the toggle I'm open to trades / Open to trades ✓", () => {
    expect(toggle).toContain(
      `label={open ? "Open to trades ✓" : "I'm open to trades"}`,
    );
    expect(toggle).not.toContain("Never mind");
  });
});

describe("what stays, in order", () => {
  it("keeps the contextual cards after the door: pitch, timers, resumed, early, closed", () => {
    const order = [
      "<RoomDoor",
      '<AccountPitch next={`/e/${normalized}`} variant="room" />',
      "{live && <RoomTimers",
      "You were already in this room",
      "This board is open early",
      '{phase === "pending" ? "Not open yet" : "This room has closed"}',
      "<RoomTicker />",
      "<MatchSummary",
      "<RoomComposerDoor",
      "<RoomBoardCard",
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
      "listWants(accountPlayerId)",
      "huntsFor(accountPlayerId, accountPlayerId)",
      "hasLocal(accountPlayerId, event.storeId)",
      "collectionAvailability(",
    ]) {
      expect(page).toContain(call);
    }
  });
});
