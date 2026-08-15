import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { EventStatsCard } from "@/components/events/event-stats";
import { EventStatusControls } from "@/components/events/event-status-controls";
import { JoinPoster } from "@/components/events/join-poster";
import { RoomRoster } from "@/components/events/room-roster";
import { WalkInSession } from "@/components/events/walk-in-session";
import { AppShell } from "@/components/layout/app-shell";
import { FlareBoard } from "@/components/lists/list-entries";
import { Badge, Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { formatEventWindow } from "@/lib/events/format";
import { listParticipants } from "@/lib/events/participants";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { findEventById, findStoreById } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { listRoomFlares } from "@/lib/lists/repository";
import { counterAvailability } from "@/lib/singles/repository";
import { eventStats } from "@/lib/trades/repository";
import { STATUS_LABELS } from "@/lib/events/schema";

export const metadata: Metadata = {
  title: "Event",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect(`/login?next=/store/events/${id}`);

  // Close whatever ran out first, so this page's status badge and room
  // snapshot describe now rather than the last scan.
  await sweepStaleRooms();

  const event = await findEventById(id);

  /*
   * A missing event and someone else's event produce the same 404.
   * Distinguishing them would let any signed-in store confirm which event ids
   * exist by walking them.
   */
  if (!event) notFound();

  const store = await findStoreById(event.store_id);
  const timeZone = store?.timezone ?? "UTC";

  const canView =
    viewer.kind === "admin" ||
    (viewer.kind === "store" && viewer.storeIds.includes(event.store_id));

  if (!canView) notFound();

  /*
   * A walk-in room has no code and no sheet: it is reached through the store's
   * permanent counter code, and printing a second code for it would put a way
   * in on the wall that stops working the next time the room reopens.
   */
  const svg = event.join_code ? await joinQrSvg(event.join_code) : null;

  const [stats, participants, flares] = await Promise.all([
    eventStats(event.id),
    listParticipants(event.id),
    listRoomFlares(event.id),
  ]);

  const counterHas = await counterAvailability(
    event.store_id,
    flares.map((entry) => entry.cardId),
  );

  const openPlayers = participants
    .filter((participant) => participant.openToTrades)
    .map((participant) => ({
      playerSessionId: participant.playerSessionId,
      displayName: participant.displayName,
    }));

  /*
   * Who each session is, keyed by session: their picture and their
   * lifetime Ember badge. Derived from the participant list that is
   * already in hand rather than queried again — it is the same set of
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
          playerId: participant.playerId,
        },
      ]),
  );

  const boardHasEntries = flares.length > 0 || openPlayers.length > 0;

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={event.name}
      description={formatEventWindow(event.starts_at, event.ends_at, timeZone)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={event.status === "open" ? "accent" : "neutral"}>
          {STATUS_LABELS[event.status]}
        </Badge>
        {event.repeat_weekly && (
          <Badge tone="neutral">
            Repeats weekly, so next week&rsquo;s appears when this closes
          </Badge>
        )}
        <Link
          href={viewer.kind === "admin" ? "/admin" : "/store"}
          className="text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
        >
          Back to all events
        </Link>
      </div>

      {stats && (
        <section className="flex flex-col gap-5" aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="text-xl font-bold text-text-primary">
            How the room went
          </h2>
          <EventStatsCard stats={stats} />
        </section>
      )}

      {(participants.length > 0 || boardHasEntries) && (
        <section className="flex flex-col gap-5" aria-labelledby="room-heading">
          <div className="flex flex-col gap-1.5">
            <h2 id="room-heading" className="text-xl font-bold text-text-primary">
              {event.status === "open" ? "In the room" : "How the board ended"}
            </h2>
            <p className="text-sm text-text-secondary">
              {event.status === "open"
                ? "The room as a player in it sees it: names, Flares and who is open to trades. Binders stay private, in here as everywhere."
                : "The Flares still standing when the room closed: the cards people went home without."}
            </p>
          </div>

          <RoomRoster participants={participants} />

          {boardHasEntries ? (
            <FlareBoard
              entries={flares}
              code={event.join_code ?? ""}
              imagesEnabled={cardImagesEnabled()}
              youId=""
              matches={new Map()}
              offers={new Map()}
              openToTrades={openPlayers}
              identities={boardIdentities}
              counterHas={counterHas}
              counterName={store?.name}
            />
          ) : (
            <p className="text-sm text-text-muted">No Flares in this room yet.</p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-5" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-xl font-bold text-text-primary">
          {event.kind === "walk_in" ? "Session" : "Event status"}
        </h2>
        <Card>
          {event.kind === "walk_in" ? (
            <WalkInSession eventId={event.id} status={event.status} />
          ) : (
            <EventStatusControls eventId={event.id} status={event.status} />
          )}
        </Card>
      </section>

      {event.join_code && svg && (
        <section className="flex flex-col gap-5" aria-labelledby="qr-heading">
          <h2 id="qr-heading" className="text-xl font-bold text-text-primary">
            Join code
          </h2>
          <JoinPoster
            kind="event"
            title={event.name}
            subtitle={formatEventWindow(event.starts_at, event.ends_at, timeZone)}
            joinCode={event.join_code}
            url={joinUrl(event.join_code)}
            qrSvg={svg}
          />
        </section>
      )}
    </AppShell>
  );
}
