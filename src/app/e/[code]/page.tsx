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
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import { formatEventWindow } from "@/lib/events/format";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import {
  findParticipation,
  listParticipants,
  touchParticipation,
} from "@/lib/events/participants";
import { findEventByJoinCode } from "@/lib/events/repository";
import { getPlayerSession } from "@/lib/players/session";
import { SITE } from "@/lib/site";
import { cardImagesEnabled } from "@/lib/cards/images";
import { listBinder, listRoomFlares } from "@/lib/lists/repository";
import { needsConfirming } from "@/lib/lists/schema";
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

  const event = await findEventByJoinCode(normalized);
  if (!event) notFound();

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
  const [participants, flares, binder] = inRoom
    ? await Promise.all([
        listParticipants(event.id),
        listRoomFlares(event.id),
        listBinder(session!.id),
      ])
    : [[], [], []];

  /*
   * Derived from the binder that was just read rather than queried again — the
   * cross-reference is the same set of cards.
   */
  const held = new Set(binder.map((entry) => entry.cardId));

  /*
   * The binder follows the player between events, so before it is trusted in
   * this room the player is asked once whether it is still accurate.
   */
  const staleBinder = needsConfirming(
    binder.map((entry) => entry.confirmedAt ?? ""),
    event.startsAt,
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
            <dd>{formatEventWindow(event.startsAt, event.endsAt)}</dd>
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
          <Card className="flex items-center gap-3">
            <PlayerAvatar displayName={session.display_name} seed={session.id} />
            <div className="flex min-w-0 flex-col">
              <p className="text-sm text-text-muted">You&rsquo;re in as</p>
              <p className="truncate font-semibold text-text-primary">
                {session.display_name}
              </p>
            </div>
          </Card>

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
                Every Flare posted here. If you have one of these, go and find them.
              </p>
            </div>

            <AddToListForm code={normalized} kind="flare" imagesEnabled={images} />

            <FlareBoard
              entries={flares}
              code={normalized}
              imagesEnabled={images}
              youId={session.id}
              heldCardIds={held}
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
        </>
      ) : (
        <Card>
          <JoinEventForm code={normalized} knownAs={session?.display_name} />
        </Card>
      )}
    </Shell>
  );
}
