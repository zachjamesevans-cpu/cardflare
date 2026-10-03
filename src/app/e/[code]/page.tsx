import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, MapPin } from "lucide-react";

import { FlareComposer } from "@/components/flares/flare-composer";
import { AccountPitch } from "@/components/players/account-pitch";
import { FlareBoard } from "@/components/lists/list-entries";
import { EarlyBanner } from "@/components/events/early-banner";
import { EventDetails } from "@/components/events/event-details";
import { FlaresAtNight, OffersNote } from "@/components/events/flares-at-night";
import { JoinEventForm } from "@/components/events/join-event-form";
import { MatchesForYou } from "@/components/events/matches-for-you";
import {
  NightHeader,
  NightShell,
  nightWhenLine,
} from "@/components/events/night-header";
import { OpenToTradesToggle } from "@/components/events/open-to-trades-toggle";
import { dedupeRoster, PlayersGoing } from "@/components/events/players-going";
import { ReadOnlyBoard } from "@/components/events/pre-start-room";
import { RoomBoardCard } from "@/components/events/room-board-card";
import { RoomComposerDoor } from "@/components/events/room-composer-door";
import { RoomDoor } from "@/components/events/room-door";
import { RoomTicker } from "@/components/events/room-ticker";
import { RoomTimers } from "@/components/event-hub/room-timers";
import { WhatToBring } from "@/components/events/what-to-bring";
import { ShowSearch } from "@/components/shows/show-search";
import { RoomLoading } from "@/components/events/room-loading";
import { StoreLobby, StoreQuiet } from "@/components/events/store-code-screens";
import { TradedTonight } from "@/components/trades/traded-tonight";
import { Card } from "@/components/ui/card";
import { formatEventWindow } from "@/lib/events/format";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  findParticipation,
  listParticipants,
  touchParticipation,
} from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { getPlayerSession } from "@/lib/players/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { listBinder, listRoomFlares } from "@/lib/lists/repository";
import { showAvailability } from "@/lib/shows/repository";
import { counterAvailability } from "@/lib/singles/repository";
import { getViewer } from "@/lib/auth/session";
import { accountIdentity } from "@/lib/players/account-identity";
import { postFlaresOnJoin } from "@/lib/events/auto-post";
import { MAX_FLARES } from "@/lib/lists/schema";
import { linkSessionToPlayer, playerForUser } from "@/lib/players/accounts";
import { hasLocal, saveLocal } from "@/lib/players/locals";
import { huntsFor } from "@/lib/players/hunts";
import { collectionAvailability } from "@/lib/players/collection";
import { listWants } from "@/lib/players/wants";
import { listRoomOffers } from "@/lib/matching/repository";
import {
  heldByCard,
  heldCountByCard,
  matchFor,
  offersByFlare,
} from "@/lib/matching/schema";
import { boardReadable, boardWritable, roomPhase } from "@/lib/events/schema";
import { goingState, nightRoster } from "@/lib/events/going";
import { EMPTY_MATCHES, nightMatches } from "@/lib/events/night-matches";
import { gameProfile } from "@/lib/event-hub/game-profiles";
import { viewerGames } from "@/lib/players/viewer-games";
import { roomTimersForStore } from "@/lib/event-hub/room-timers";
import { organizerStoresFor } from "@/lib/stores/staff";
import { publicStore } from "@/lib/stores/public-profile";
import { listMyTrades } from "@/lib/trades/repository";
import type { ListEntry } from "@/lib/lists/repository";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Join event",
  // A per-event page reached by scanning a printed code. Never indexed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Shown when the code is well-formed but cannot be checked right now. */
function Unavailable() {
  return (
    <NightShell>
      <Card className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text-primary">
          We can&rsquo;t check that code right now
        </h1>
        <p className="text-text-secondary">
          Nothing is wrong with the code on the sheet. Give it a moment and scan again.
        </p>
      </Card>
    </NightShell>
  );
}

/** A short note under the header, in the accent's tint: not a card. */
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm">
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="text-text-secondary">{children}</p>
    </div>
  );
}

/**
 * Where the printed QR code points.
 *
 * Kept short (`/e/CODE`) on purpose: fewer characters means a lower QR
 * version, larger modules at the same printed size, and a code that scans from
 * further away in worse light.
 */
export default async function JoinByCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ resumed?: string; skipped?: string; g?: string }>;
}) {
  const { code } = await params;
  const params_ = await searchParams;
  const normalized = normalizeJoinCode(decodeURIComponent(code));

  /* Before anything suspends, so a malformed code is still a 404. */
  if (!isValidJoinCode(normalized)) notFound();

  return (
    <Suspense fallback={<RoomLoading />}>
      <RoomBody normalized={normalized} params_={params_} />
    </Suspense>
  );
}

async function RoomBody({
  normalized,
  params_,
}: {
  normalized: string;
  params_: { resumed?: string; skipped?: string; g?: string };
}) {
  /*
   * Set by the join action when the tap picked up a seat this account
   * already had: from the app, or from this browser earlier. Saying so is
   * the point: a join that appears to do nothing is exactly what a duplicate
   * used to look like from the inside.
   */
  const resumed = params_.resumed === "1";
  /* Set by the join when the player's list was longer than the board
     holds. Said once, on arrival, rather than going quiet. */
  const skipped = Math.max(0, Math.min(999, Number(params_.skipped) || 0));

  /*
   * The scan's game, when the code came off a tournament's own screen.
   * `?g=one-piece` puts that TCG first for this room's card search, so
   * it is the game the composer opens on: the counter code stays
   * universal, and the per-tournament QR is where the scope comes from.
   * Validated against the five real profiles, so a crafted URL degrades
   * to the player's own games rather than an empty search.
   */
  const scannedGame = gameProfile(params_.g ?? "")?.id ?? null;
  const playerGames = await viewerGames();
  const games = scannedGame
    ? [scannedGame, ...playerGames.filter((game) => game !== scannedGame)]
    : playerGames;

  /*
   * A well-formed code that cannot be looked up is not the same as one that
   * does not exist. During an outage, 404 would tell a player standing at the
   * counter that the store's printed code is wrong.
   */
  if (!isSupabaseConfigured()) return <Unavailable />;

  const resolved = await resolveCode(normalized);
  if (resolved.outcome === "not-found") notFound();

  /*
   * A signed-in player joins as themselves rather than filling in a name.
   * Resolved once here because both doors into a room, the walk-in lobby
   * and the open board, ask the same question.
   */
  const accountName = (await accountIdentity(await getViewer()))?.displayName;

  /*
   * A card show: search-only, sessionless on purpose. An attendee in a
   * convention hall gets "booth A12 has it" with nothing between them and
   * the answer: no name, no join, no account.
   */
  if (resolved.outcome === "show") {
    const show = resolved.show;
    const where = [show.city, show.region].filter(Boolean).join(", ");

    /*
     * The wants a signed-in attendee carries meet the hall's inventory the
     * moment they scan in: no search, no asking every vendor. Guests get
     * the same search box as always; this panel simply never renders.
     */
    const showViewer = await getViewer();
    const showPlayerId =
      showViewer.kind === "player"
        ? showViewer.playerId
        : showViewer.kind === "anonymous"
          ? null
          : ((await playerForUser(showViewer.user.id))?.id ?? null);

    const showWants = showPlayerId ? await listWants(showPlayerId) : [];
    const wantHits = showPlayerId
      ? await showAvailability(
          show.id,
          showWants.map((want) => want.cardId),
        )
      : new Map<string, import("@/lib/shows/schema").VendorAvailability[]>();

    const matchedWants = showWants.filter(
      (want) => (wantHits.get(want.cardId) ?? []).length > 0,
    );

    return (
      <NightShell wide>
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-accent">Card show</p>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              {show.name}
            </h1>
          </div>

          <dl className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
              <dt className="sr-only">When</dt>
              <dd>{formatEventWindow(show.startsAt, show.endsAt, show.timeZone)}</dd>
            </div>
            {where && (
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden />
                <dt className="sr-only">Where</dt>
                <dd>{where}</dd>
              </div>
            )}
          </dl>
        </Card>

        {matchedWants.length > 0 && (
          <Card className="flex flex-col gap-3 border-accent/30">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-text-primary">
                Your wants, in this hall
              </h2>
              <p className="text-sm text-text-secondary">
                {matchedWants.length} of the {showWants.length}{" "}
                {showWants.length === 1 ? "card" : "cards"} you&rsquo;re looking for{" "}
                {matchedWants.length === 1 ? "is" : "are"} here right now.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {matchedWants.map((want) => (
                <li key={want.id} className="flex flex-col">
                  <span className="font-semibold text-text-primary">
                    {want.cardName}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {(wantHits.get(want.cardId) ?? [])
                      .map((hit) => `Booth ${hit.booth} · ${hit.vendorName}`)
                      .join("  ·  ")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ShowSearch code={normalized} />
      </NightShell>
    );
  }

  /* Walk-in trading is off and no event is running. */
  if (resolved.outcome === "quiet") {
    return (
      <NightShell>
        <StoreQuiet storeName={resolved.store.name} earlyBoard={resolved.earlyBoard} />
      </NightShell>
    );
  }

  /*
   * Nothing open yet, but walk-in trading is allowed. Looking at this page
   * does not open the room: submitting the form does, so an empty session
   * never lands in the store's history because somebody glanced at the counter
   * on their way past.
   */
  if (resolved.outcome === "lobby") {
    const waiting = await getPlayerSession();

    return (
      <NightShell>
        <StoreLobby
          storeName={resolved.store.name}
          code={normalized}
          knownAs={waiting?.display_name}
          accountName={accountName}
          earlyBoard={resolved.earlyBoard}
        />
      </NightShell>
    );
  }

  const event = resolved.room;

  const session = await getPlayerSession();
  const participation = session ? await findParticipation(event.id, session.id) : null;

  // Being here is the heartbeat. Rate-limited inside against `lastSeenAt`, so
  // a reload is not a write.
  if (session && participation) {
    await touchParticipation(event.id, session.id, participation.lastSeenAt);
  }

  const inRoom = Boolean(participation && session);

  /*
   * One phase, decided once, rendered everywhere below. "early" is a real
   * room days before doors: the join form works, the board works, and a
   * one-line banner says the people on it are still on their way.
   * "upcoming" is the night from the moment the store posts it:
   * browsable by anyone, and Going is the way onto it.
   */
  const phase = roomPhase(event);

  /*
   * The board is open to look at from the moment the night is posted
   * until it closes, and read-only once it has (a night in Past keeps
   * its board, so what was wanted is still there to see). A viewer
   * with a seat gets the working board; one without gets the same
   * board read-only.
   */
  const readable = boardReadable(phase);
  const writable = boardWritable(phase);
  const finished = phase === "finished";
  const browsing = (readable || finished) && !inRoom;
  /* A scheduled night gets the compact header; a walk-in room keeps
     its door, with the people list and the leave form behind it. */
  const scheduled = event.kind !== "walk_in";

  /*
   * The lists are read for a player in the room, and the board alone
   * for somebody browsing. A visitor looking at a join form on a night
   * that never opened has no business causing a read of anybody's lists.
   */
  const [participants, flares, binder, roomOffers, myTrades] = inRoom
    ? await Promise.all([
        listParticipants(event.id),
        listRoomFlares(event.id),
        listBinder(session!.id),
        listRoomOffers(event.id),
        listMyTrades(event.id, session!.id),
      ])
    : [[], browsing ? await listRoomFlares(event.id) : [], [], [], []];

  /* The tournament clocks, for anyone who cannot see the wall from
     their seat, or stepped outside with the room in their pocket. */
  const roomTimers = inRoom ? await roomTimersForStore(event.storeId) : [];

  /*
   * The counter check: which of the board's cards the store's synced
   * singles cover. Empty when the store has never synced, so the line
   * simply never appears: no store setting, no toggle, no dead UI.
   */
  const counterHas = inRoom
    ? await counterAvailability(
        event.storeId,
        flares.map((entry) => entry.cardId),
      )
    : new Set<string>();

  /*
   * The optional account, resolved without ever being required: a guest
   * has viewer "anonymous" and everything below stays exactly as it was.
   * A signed-in player gets their session claimed by their account and an
   * offer to re-post whatever they are still hunting from last time.
   */
  const viewer = await getViewer();
  const accountPlayerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (inRoom && session && accountPlayerId && session.player_id === null) {
    await linkSessionToPlayer(session.id, accountPlayerId);
    /*
     * Being in a room signed in is what makes a store a local. The join
     * path already saves it for an account that joined as itself; this
     * covers the one that joined as a guest and signed in afterwards.
     * Only on that first link, never on every twelve-second refresh:
     * the render used to write this row on every poll of every phone.
     */
    await saveLocal(accountPlayerId, event.storeId);
    /* A guest who signs in mid-night gets their Flares on the board the
       same as somebody who joined signed in. See auto-post.ts. */
    await postFlaresOnJoin(event.id, session, accountPlayerId);
  }

  /*
   * The night's roster, the viewer's place on it, and what Cardflare
   * found for them: who has what they want, who wants what they have,
   * and what to pack. Read after the link above, so an account that
   * just signed in mid-night counts as going the moment its seat is
   * its own. A guest gets no matches: matching runs on an account's
   * wants and binder, and a finished night matches nobody.
   */
  const [night, rawRoster, matches, store] = await Promise.all([
    readable ? goingState(event.id, accountPlayerId) : Promise.resolve(null),
    readable || finished ? nightRoster(event.id, accountPlayerId) : Promise.resolve([]),
    readable && accountPlayerId
      ? nightMatches(event.id, accountPlayerId)
      : Promise.resolve(EMPTY_MATCHES),
    scheduled ? publicStore(event.storeId, accountPlayerId) : Promise.resolve(null),
  ]);
  const roster = dedupeRoster(rawRoster);
  const hereNow = roster.filter((player) => player.present).length;

  /*
   * The composer is the Flare tab's, given the same things: the hunts a
   * post can join, and the poster's own face and name for the preview.
   * The face comes off the participant list already in hand, so posting
   * from a room costs no query the Flare tab does not also make.
   */
  const hunts =
    inRoom && accountPlayerId ? await huntsFor(accountPlayerId, accountPlayerId) : [];
  const me = participants.find(
    (participant) => participant.playerSessionId === session?.id,
  );
  const poster =
    accountPlayerId && session
      ? {
          id: accountPlayerId,
          displayName: me?.displayName ?? session.display_name,
          avatarUrl: me?.avatarUrl ?? null,
        }
      : null;

  /*
   * The store is linked from the room, with Follow beside it. The
   * founder: "if a player is in a room for that store, the store is
   * linked in there for them to quickly follow that store's page and
   * stay updated." Read after the join above has had its chance to
   * write the row, so the button's first word is the truth.
   */
  const followingStore = accountPlayerId
    ? await hasLocal(accountPlayerId, event.storeId)
    : false;

  /*
   * The timer remote, as a small icon on the door for the people who
   * can use it: the store's organizers. The same lookup the TO badge
   * uses, so whoever the owner named sees the stopwatch and nobody else
   * does. The console's own gate decides again on the far side.
   */
  const organizerStores =
    inRoom && accountPlayerId ? await organizerStoresFor(accountPlayerId) : [];
  const remoteHref = organizerStores.some((store) => store.storeId === event.storeId)
    ? "/store/event-hub"
    : null;

  /*
   * The matching engine, such as it is: derived from the binder that was just
   * read rather than queried again, because the cross-reference *is* the
   * binder. Computed for this viewer only: the room learns somebody can help
   * only when that somebody offers.
   */
  const held = heldByCard(binder);

  /* How many of each the binder claims, for the card viewer's own line.
     The binder alone: the collection below proves printings, not counts. */
  const heldCounts = heldCountByCard(binder);

  /*
   * The imported collection joins the cross-reference the quiet way:
   * checked against the board rather than loaded whole. A card arrives
   * with exactly the printings the import proved from the file's own
   * names: a proven alternate art matches a Flare for that alt art
   * exactly; an unproven one stays a key with no printings, which
   * `matchFor` honestly downgrades when a Flare names one.
   */
  const collectionHas = accountPlayerId
    ? await collectionAvailability(
        accountPlayerId,
        flares.map((entry) => entry.cardId),
      )
    : new Map<string, Set<string>>();

  for (const [cardId, printings] of collectionHas) {
    const proven = held.get(cardId) ?? new Set<string>();
    for (const printingId of printings) proven.add(printingId);
    held.set(cardId, proven);
  }

  const boardMatches = new Map(
    flares.flatMap((entry) => {
      const match = matchFor(entry, held);
      return match ? [[entry.id, match] as const] : [];
    }),
  );

  const offers = offersByFlare(roomOffers);

  /* The requester's side: offers standing on the viewer's own open Flares. */
  const myFlaresWithOffers = flares.filter(
    (entry) =>
      entry.playerSessionId === session?.id && (offers.get(entry.id) ?? []).length > 0,
  );
  const offersOnMine = myFlaresWithOffers.reduce(
    (sum, entry) => sum + (offers.get(entry.id) ?? []).length,
    0,
  );

  /*
   * Read off the participant list that was already loaded rather than queried
   * again: being open to trades is a property of being in the room, so the
   * answer is already in hand.
   */
  const openPlayers = participants
    .filter((participant) => participant.openToTrades)
    .map(({ playerSessionId, displayName }) => ({ playerSessionId, displayName }));

  /*
   * Who each session is, keyed by session: their picture and their
   * lifetime Ember badge. Derived from the participant list that is
   * already in hand rather than queried again: it is the same set of
   * people, and a second query would be a second chance for the two
   * lists to disagree. Guests carry a null total and are left out, so
   * their header shows initials and no badge.
   */
  const boardIdentities = new Map(
    participants
      .filter((participant) => participant.embersEarned !== null)
      .map((participant) => [
        participant.playerSessionId,
        {
          embersEarned: participant.embersEarned as number,
          avatarUrl: participant.avatarUrl,
          frame: participant.frame,
          ring: participant.ring,
          aura: participant.aura,
          ringArt: participant.ringArt,
          auraArt: participant.auraArt,
          playerId: participant.playerId,
        },
      ]),
  );

  const youAreOpen = participants.some(
    (participant) =>
      participant.playerSessionId === session?.id && participant.openToTrades,
  );

  const images = cardImagesEnabled();
  const location = [event.storeCity, event.storeRegion].filter(Boolean).join(", ");

  /*
   * The room is live when the viewer is in it and the night is on:
   * the ticker, the clocks, the composer and the board all hang off
   * this one answer.
   */
  const live = inRoom && session && (phase === "live" || phase === "early");

  /*
   * How often the page re-reads itself: every twelve seconds while the
   * night is on, once a minute while the board is open early, and not
   * at all for a night still days out, where nothing moves by the
   * minute. The app's POLL_MS steps the same way.
   */
  const tickerMs = phase === "live" ? 12_000 : phase === "early" ? 60_000 : null;

  /*
   * The board, once per filter: everything, the Hunting Flares (intent
   * "want") and the Offering ones (intent "showcase"). Server-rendered
   * three times so every tile and every offer form is exactly the
   * board's own, and the filter island only picks which is on screen.
   * A filter with nothing behind it hands over null, and the island
   * says so in one line.
   */
  const hunting = flares.filter((entry) => entry.intent === "want");
  const offering = flares.filter((entry) => entry.intent === "showcase");
  const boardFor = (entries: ListEntry[], all: boolean) => {
    if (inRoom && session && !finished) {
      if (!all && entries.length === 0) return null;
      return (
        <RoomBoardCard
          empty={entries.length === 0 && openPlayers.length === 0}
          guestTrades={
            accountPlayerId ? null : (
              <OpenToTradesToggle code={normalized} open={youAreOpen} />
            )
          }
        >
          <FlareBoard
            entries={entries}
            code={normalized}
            imagesEnabled={images}
            youId={session.id}
            matches={boardMatches}
            offers={offers}
            openToTrades={openPlayers}
            identities={boardIdentities}
            counterHas={counterHas}
            counterName={event.storeName}
            heldCounts={heldCounts}
            early={phase === "early"}
          />
        </RoomBoardCard>
      );
    }
    if (!all && entries.length === 0) return null;
    return <ReadOnlyBoard flares={entries} roster={roster} imagesEnabled={images} />;
  };

  const header = scheduled ? (
    <NightHeader
      storeId={event.storeId}
      storeName={event.storeName}
      storeVerified={event.storeVerified}
      following={accountPlayerId ? followingStore : null}
      code={normalized}
      name={event.name}
      when={nightWhenLine(event.startsAt, event.endsAt, event.storeTimeZone)}
      remoteHref={remoteHref}
      helpHref={`/tournaments?from=${encodeURIComponent(`/e/${normalized}`)}`}
      line={
        readable && night
          ? {
              eventId: event.id,
              youGoing: night.youGoing,
              goingCount: night.goingCount,
              signedIn: Boolean(accountPlayerId),
              hereNow: phase === "upcoming" ? 0 : hereNow,
            }
          : null
      }
    />
  ) : (
    /*
     * The walk-in door: store, night, pulse. A walk-in room has no
     * schedule and no RSVP, so its door keeps the people list and the
     * leave form behind the pulse line.
     */
    <RoomDoor
      storeId={event.storeId}
      storeName={event.storeName}
      storeVerified={event.storeVerified}
      following={accountPlayerId ? followingStore : null}
      code={normalized}
      name={event.name}
      when={
        event.kind === "walk_in"
          ? "Trading now"
          : formatEventWindow(event.startsAt, event.endsAt, event.storeTimeZone)
      }
      location={location}
      remoteHref={remoteHref}
      helpHref={null}
      people={
        inRoom && session
          ? {
              participants,
              youId: session.id,
              imagesEnabled: images,
              flareCount: flares.length,
            }
          : null
      }
    />
  );

  return (
    <NightShell wide={inRoom || browsing}>
      {header}

      {/* The wall's clocks, for a seat that cannot see the wall.
          Self-polling, so a reset or a fresh tournament shows up
          without anybody refreshing anything; draws nothing when
          there are no timers. */}
      {live && <RoomTimers initial={roomTimers} code={normalized} />}

      {inRoom && skipped > 0 && (
        <Note title={`${skipped} of your Flares did not fit`}>
          The board holds {MAX_FLARES} per player. The rest stay on your list, and the
          Feed still shows them.
        </Note>
      )}

      {inRoom && resumed && (
        <Note title="You were already in this room">
          Same seat, same Flares, same binder. Your account is one player here however
          you got in, so nothing was posted twice.
        </Note>
      )}

      {phase === "early" && <EarlyBanner />}

      {/* "Not open yet" and "This room has closed" keep their lines,
          under the header rather than in a tall card. The closed line
          points at the Follow chip above only when there is one. */}
      {(phase === "pending" || finished) && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-3">
          <h2 className="font-semibold text-text-primary">
            {phase === "pending" ? "Not open yet" : "This room has closed"}
          </h2>
          <p className="text-sm text-text-secondary">
            {phase === "pending"
              ? "The store has not opened this room yet. Scan the code again when it starts."
              : accountPlayerId && !followingStore
                ? `This room has closed. Follow ${event.storeName} above to hear about the next one.`
                : "This room has closed. Thanks for coming."}
          </p>
        </div>
      )}

      {/* The way in, for whoever the Going chip cannot seat: a guest,
          who has no account to say Going with; and anyone on a live
          night, where the door is what pays attendance. */}
      {browsing && readable && (!accountName || phase === "live") && (
        <Card className="p-4">
          <JoinEventForm
            code={normalized}
            knownAs={session?.display_name}
            accountName={phase === "live" ? accountName : undefined}
          />
        </Card>
      )}

      {readable && (
        <>
          {/* Offers land while people wander; the room re-reads itself. */}
          {tickerMs !== null && <RoomTicker intervalMs={tickerMs} />}

          {/*
           * The Flare tab's composer, behind the floating "+ Flare"
           * button: a night page is for seeing the night, so the
           * composer opens in place when asked and folds away again.
           * It needs an account and a seat, so a guest keeps the pitch
           * below and gets their open-to-trades row at the foot of the
           * board instead.
           */}
          {poster && writable && (
            <RoomComposerDoor
              composer={
                <FlareComposer
                  viewer={poster}
                  hunts={hunts.map((entry) => ({ id: entry.id, name: entry.name }))}
                  imagesEnabled={images}
                  playerGames={games}
                  game={scannedGame}
                  room={{ name: event.name, storeName: event.storeName }}
                  initialHuntId={null}
                  footer={<OpenToTradesToggle code={normalized} open={youAreOpen} />}
                />
              }
            />
          )}

          {/* Matches for you: the first section, for an account. A
              guest sees here the one thing they lose without one. */}
          {accountPlayerId ? (
            <MatchesForYou matches={matches} code={normalized} imagesEnabled={images} />
          ) : (
            <AccountPitch
              next={`/e/${normalized}`}
              variant={inRoom ? "room" : "join"}
            />
          )}

          {accountPlayerId && matches.bring.length > 0 && (
            <WhatToBring eventId={event.id} bring={matches.bring} />
          )}
        </>
      )}

      {(readable || finished) && (
        <FlaresAtNight
          boards={{
            all: boardFor(flares, true),
            hunting: boardFor(hunting, false),
            offering: boardFor(offering, false),
          }}
          note={
            session && offersOnMine > 0 ? (
              <OffersNote
                offerCount={offersOnMine}
                flareCount={myFlaresWithOffers.length}
                anchor={`#flares-${session.id}`}
              />
            ) : null
          }
        />
      )}

      {readable && scheduled && <PlayersGoing roster={roster} code={normalized} />}

      {scheduled && (
        <EventDetails
          storeId={event.storeId}
          storeName={event.storeName}
          address={store?.address ?? (location || null)}
          code={normalized}
        />
      )}

      {/*
       * There is deliberately no "What you brought" section any more.
       * The founder's read, and it holds up: nobody types their binder
       * in at a store table, and someone who sees a Flare already
       * knows whether they have the card. The binder and the imported
       * collection still power the "You have this" badges on the
       * board above, silently, which is all they were ever good for.
       */}
      {inRoom && (
        <TradedTonight
          trades={myTrades}
          timeZone={event.storeTimeZone}
          code={normalized}
        />
      )}
    </NightShell>
  );
}
