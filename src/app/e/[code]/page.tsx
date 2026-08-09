import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { EventLobby } from "@/components/events/event-lobby";
import { AddToListForm } from "@/components/lists/add-to-list-form";
import { ConfirmBinder } from "@/components/lists/confirm-binder";
import { FlareBoard, HaveList } from "@/components/lists/list-entries";
import { JoinEventForm } from "@/components/events/join-event-form";
import { MatchSummary } from "@/components/matching/match-summary";
import { OpenToTradesToggle } from "@/components/events/open-to-trades-toggle";
import { RoomTicker } from "@/components/events/room-ticker";
import { ShowSearch } from "@/components/shows/show-search";
import { StoreLobby, StoreQuiet } from "@/components/events/store-code-screens";
import { TradedTonight } from "@/components/trades/traded-tonight";
import { PlayerAvatar } from "@/components/players/player-avatar";
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
import { SITE } from "@/lib/site";
import { cardImagesEnabled } from "@/lib/cards/images";
import { listBinder, listRoomFlares } from "@/lib/lists/repository";
import { showAvailability } from "@/lib/shows/repository";
import { counterAvailability } from "@/lib/singles/repository";
import { getViewer } from "@/lib/auth/session";
import { linkSessionToPlayer, playerForUser } from "@/lib/players/accounts";
import { collectionAvailability, collectionSyncFor } from "@/lib/players/collection";
import { listWants } from "@/lib/players/wants";
import { RepostWants } from "@/components/players/repost-wants";
import { needsConfirming } from "@/lib/lists/schema";
import { listRoomOffers } from "@/lib/matching/repository";
import { heldByCard, matchFor, offersByFlare } from "@/lib/matching/schema";
import { listMyTrades } from "@/lib/trades/repository";
import { binderPrompts } from "@/lib/trades/schema";
import { cn } from "@/lib/cn";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Join event",
  // A per-event page reached by scanning a printed code. Never indexed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * `wide` is for a player who is actually in the room. Everything else here —
 * a join form, an error, a closed event — is a single card that should stay
 * narrow and centred; a room with Flare boards in it needs the space.
 */
function Shell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <main
      id="main"
      className={cn(
        "flex min-h-dvh flex-col items-center gap-8 px-5 py-16",
        wide ? "justify-start" : "justify-center",
      )}
    >
      <Link href="/" aria-label={`${SITE.name} home`}>
        <Logo size={40} priority />
      </Link>
      <div
        className={cn("flex w-full flex-col gap-5", wide ? "max-w-2xl" : "max-w-md")}
      >
        {children}
      </div>
    </main>
  );
}

/** Shown when the code is well-formed but cannot be checked right now. */
function Unavailable() {
  return (
    <Shell>
      <Card className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-text-primary">
          We can&rsquo;t check that code right now
        </h1>
        <p className="text-text-secondary">
          Nothing is wrong with the code on the sheet. Give it a moment and scan again.
        </p>
      </Card>
    </Shell>
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
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const normalized = normalizeJoinCode(decodeURIComponent(code));

  if (!isValidJoinCode(normalized)) notFound();

  /*
   * A well-formed code that cannot be looked up is not the same as one that
   * does not exist. During an outage, 404 would tell a player standing at the
   * counter that the store's printed code is wrong.
   */
  if (!isSupabaseConfigured()) return <Unavailable />;

  const resolved = await resolveCode(normalized);
  if (resolved.outcome === "not-found") notFound();

  /*
   * A card show: search-only, sessionless on purpose. An attendee in a
   * convention hall gets "booth A12 has it" with nothing between them and
   * the answer — no name, no join, no account.
   */
  if (resolved.outcome === "show") {
    const show = resolved.show;
    const where = [show.city, show.region].filter(Boolean).join(", ");

    /*
     * The wants a signed-in attendee carries meet the hall's inventory the
     * moment they scan in — no search, no asking every vendor. Guests get
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
      <Shell wide>
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
                {showWants.length === 1 ? "card" : "cards"} you&rsquo;re hunting{" "}
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
      </Shell>
    );
  }

  /* Walk-in trading is off and no event is running. */
  if (resolved.outcome === "quiet") {
    return (
      <Shell>
        <StoreQuiet storeName={resolved.store.name} />
      </Shell>
    );
  }

  /*
   * Nothing open yet, but walk-in trading is allowed. Looking at this page
   * does not open the room — submitting the form does, so an empty session
   * never lands in the store's history because somebody glanced at the counter
   * on their way past.
   */
  if (resolved.outcome === "lobby") {
    const waiting = await getPlayerSession();

    return (
      <Shell>
        <StoreLobby
          storeName={resolved.store.name}
          code={normalized}
          knownAs={waiting?.display_name}
        />
      </Shell>
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
   * Only read once the player is actually in the room. A visitor looking at a
   * join form has no business causing a read of anybody's lists.
   */
  const [participants, flares, binder, roomOffers, myTrades] = inRoom
    ? await Promise.all([
        listParticipants(event.id),
        listRoomFlares(event.id),
        listBinder(session!.id),
        listRoomOffers(event.id),
        listMyTrades(event.id, session!.id),
      ])
    : [[], [], [], [], []];

  /*
   * The counter check: which of the board's cards the store's synced
   * singles cover. Empty when the store has never synced, so the line
   * simply never appears — no store setting, no toggle, no dead UI.
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
  }

  const savedWants = inRoom && accountPlayerId ? await listWants(accountPlayerId) : [];

  /* Outstanding = saved but not already an open Flare of theirs here. */
  const postedAsks = new Set(
    flares
      .filter((entry) => entry.playerSessionId === session?.id)
      .map((entry) => `${entry.cardId}:${entry.printingId ?? ""}`),
  );
  const outstandingWants = savedWants
    .filter((want) => !postedAsks.has(`${want.cardId}:${want.printingId ?? ""}`))
    .map((want) => ({
      id: want.id,
      label: want.printingLabel
        ? `${want.cardName} (${want.printingLabel})`
        : want.cardName,
    }));

  /*
   * The matching engine, such as it is: derived from the binder that was just
   * read rather than queried again, because the cross-reference *is* the
   * binder. Computed for this viewer only — the room learns somebody can help
   * only when that somebody offers.
   */
  const held = heldByCard(binder);

  /*
   * The imported collection joins the cross-reference the quiet way:
   * checked against the board rather than loaded whole. A card arrives
   * with exactly the printings the import proved from the file's own
   * names — a proven alternate art matches a Flare for that alt art
   * exactly; an unproven one stays a key with no printings, which
   * `matchFor` honestly downgrades when a Flare names one.
   */
  const [collectionHas, collectionSync] = accountPlayerId
    ? await Promise.all([
        collectionAvailability(
          accountPlayerId,
          flares.map((entry) => entry.cardId),
        ),
        collectionSyncFor(accountPlayerId),
      ])
    : [new Map<string, Set<string>>(), null];

  for (const [cardId, printings] of collectionHas) {
    const proven = held.get(cardId) ?? new Set<string>();
    for (const printingId of printings) proven.add(printingId);
    held.set(cardId, proven);
  }

  const matches = new Map(
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
   * The binder follows the player between events, so before it is trusted in
   * this room the player is asked once whether it is still accurate.
   */
  const staleBinder = needsConfirming(
    binder.map((entry) => entry.confirmedAt ?? ""),
    event.startsAt,
  );

  /*
   * Read off the participant list that was already loaded rather than queried
   * again — being open to trades is a property of being in the room, so the
   * answer is already in hand.
   */
  const openPlayers = participants
    .filter((participant) => participant.openToTrades)
    .map(({ playerSessionId, displayName }) => ({ playerSessionId, displayName }));

  /*
   * The after-trade binder nudge: holder-side trades newer than the binder
   * entry's own confirmation. Derived from data already in hand.
   */
  const prompts = binderPrompts(myTrades, binder);

  const youAreOpen = participants.some(
    (participant) =>
      participant.playerSessionId === session?.id && participant.openToTrades,
  );

  const images = cardImagesEnabled();
  const location = [event.storeCity, event.storeRegion].filter(Boolean).join(", ");

  return (
    <Shell wide={inRoom}>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-accent">{event.storeName}</p>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {event.name}
          </h1>
        </div>

        <dl className="flex flex-col gap-2 text-sm text-text-secondary">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
            <dt className="sr-only">When</dt>
            {/*
             * A walk-in room has no schedule to report, and a player standing
             * in the store does not need one. A scheduled event does — knowing
             * when it finishes is how somebody decides whether to wait around.
             */}
            <dd>
              {event.kind === "walk_in"
                ? "Trading now"
                : formatEventWindow(event.startsAt, event.endsAt, event.storeTimeZone)}
            </dd>
          </div>
          {location && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden />
              <dt className="sr-only">Where</dt>
              <dd>{location}</dd>
            </div>
          )}
        </dl>
      </Card>

      {event.status !== "open" ? (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold text-text-primary">
            {event.status === "draft" ? "Not open yet" : "This event has finished"}
          </h2>
          <p className="text-text-secondary">
            {event.status === "draft"
              ? "The store hasn't opened this room yet. Try again once the event starts."
              : "Thanks for coming. Ask the store about their next event."}
          </p>
        </Card>
      ) : inRoom && session ? (
        <>
          {/* Offers land while people wander; the room re-reads itself. */}
          <RoomTicker />

          {outstandingWants.length > 0 && (
            <RepostWants code={normalized} wants={outstandingWants} />
          )}

          <Card className="flex items-center gap-3">
            <PlayerAvatar displayName={session.display_name} seed={session.id} />
            <div className="flex min-w-0 flex-col">
              <p className="text-sm text-text-muted">You&rsquo;re in as</p>
              <p className="truncate font-semibold text-text-primary">
                {session.display_name}
              </p>
            </div>
          </Card>

          <MatchSummary
            offerCount={offersOnMine}
            flareCount={myFlaresWithOffers.length}
            anchor={`#flares-${session.id}`}
          />

          <EventLobby
            code={normalized}
            participants={participants}
            youId={session.id}
          />

          <section className="flex flex-col gap-4" aria-labelledby="flares-heading">
            <div className="flex flex-col gap-1">
              <h2 id="flares-heading" className="text-lg font-bold text-text-primary">
                Wanted in this room
              </h2>
              <p className="text-sm text-text-secondary">
                Every Flare posted here, and everyone open to any trade. If you can
                help, go and find them.
              </p>
            </div>

            <AddToListForm code={normalized} kind="flare" imagesEnabled={images} />

            {/*
             * The other way onto the board, directly under the form that is
             * the first way. "I don't know what to search for" happens right
             * here, so this is where the answer to it has to be.
             */}
            <OpenToTradesToggle code={normalized} open={youAreOpen} />

            <FlareBoard
              entries={flares}
              code={normalized}
              imagesEnabled={images}
              youId={session.id}
              matches={matches}
              offers={offers}
              openToTrades={openPlayers}
              counterHas={counterHas}
              counterName={event.storeName}
            />
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="haves-heading">
            <div className="flex flex-col gap-1">
              <h2 id="haves-heading" className="text-lg font-bold text-text-primary">
                What you brought
              </h2>
              <p className="text-sm text-text-secondary">
                Private to you, and it follows you to every event. Used to flag Flares
                above that you can answer.
              </p>
            </div>

            {staleBinder && <ConfirmBinder code={normalized} count={binder.length} />}

            {/*
             * The whole collection surface a room ever shows: one line, to
             * its owner only. A thousand imported cards listed under "what
             * you brought" would be exactly the redundancy the founder
             * ruled out — the collection works by flagging Flares above.
             */}
            {collectionSync && collectionSync.cards_matched > 0 && (
              <p className="text-sm text-text-muted">
                Your collection ({collectionSync.cards_matched.toLocaleString()}{" "}
                {collectionSync.cards_matched === 1 ? "card" : "cards"}) is along too —
                it flags Flares you could answer without being listed here.
              </p>
            )}

            <AddToListForm code={normalized} kind="have" imagesEnabled={images} />

            <HaveList entries={binder} code={normalized} imagesEnabled={images} />
          </section>

          <TradedTonight
            trades={myTrades}
            prompts={prompts}
            code={normalized}
            timeZone={event.storeTimeZone}
          />

          {/*
           * The quietest possible mention of accounts, and only to guests.
           * No sign-up funnel — accounts are invite-only — and nothing about
           * the room changes without one. Want a quick trade? You already
           * have everything you need.
           */}
          {!accountPlayerId && (
            <p className="text-center text-xs text-text-muted">
              Have a CardFlare account?{" "}
              <Link
                href={`/login?next=/e/${normalized}`}
                className="text-text-secondary underline underline-offset-4 hover:text-text-primary"
              >
                Sign in
              </Link>{" "}
              and the cards you post here will follow you to other stores.
            </p>
          )}
        </>
      ) : (
        <Card>
          <JoinEventForm code={normalized} knownAs={session?.display_name} />
        </Card>
      )}
    </Shell>
  );
}
