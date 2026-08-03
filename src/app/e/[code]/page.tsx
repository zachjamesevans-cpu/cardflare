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
   * The matching engine, such as it is: derived from the binder that was just
   * read rather than queried again, because the cross-reference *is* the
   * binder. Computed for this viewer only — the room learns somebody can help
   * only when that somebody offers.
   */
  const held = heldByCard(binder);

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

            <AddToListForm code={normalized} kind="have" imagesEnabled={images} />

            <HaveList entries={binder} code={normalized} imagesEnabled={images} />
          </section>

          <TradedTonight
            trades={myTrades}
            prompts={prompts}
            code={normalized}
            timeZone={event.storeTimeZone}
          />
        </>
      ) : (
        <Card>
          <JoinEventForm code={normalized} knownAs={session?.display_name} />
        </Card>
      )}
    </Shell>
  );
}
