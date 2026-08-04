import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { VendorBooths, VendorInventoryReadonly } from "@/components/admin/store-detail";
import { RoomRoster } from "@/components/events/room-roster";
import { JoinPoster } from "@/components/events/join-poster";
import { EventList } from "@/components/events/event-list";
import { FlareBoard } from "@/components/lists/list-entries";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { countParticipants, listParticipants } from "@/lib/events/participants";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { findStoreById, listEventsForStore } from "@/lib/events/repository";
import { resolveCode, sweepStaleRooms } from "@/lib/events/rooms";
import { listRoomFlares } from "@/lib/lists/repository";
import { boothsForStore, listInventory, listShows } from "@/lib/shows/repository";
import { listStores } from "@/lib/stores/repository";

export const metadata: Metadata = {
  title: "Store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const KIND_LABEL = { lgs: "Game store", vendor: "Card-show vendor" } as const;

/**
 * One store, from the console: what it is, what its code prints as, and what
 * is happening in its room right now.
 *
 * The room view is deliberately the player's view — roster and Flare board,
 * never anyone's binder. An admin watching a pilot night should see exactly
 * what the people in the room see, and no more.
 */
export default async function AdminStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();
  const { id } = await params;

  await sweepStaleRooms();

  const store = await findStoreById(id);
  if (!store) notFound();

  const listing = (await listStores()).find((row) => row.id === store.id);
  const location = [store.city, store.region].filter(Boolean).join(", ");
  const isVendor = store.kind === "vendor";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/stores"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to stores
        </Link>

        <h2 className="text-xl font-bold text-text-primary">{store.name}</h2>
        <p className="text-sm text-text-secondary">{store.contact_email}</p>

        <div className="flex flex-wrap items-center gap-3">
          <Badge>
            {KIND_LABEL[store.kind as keyof typeof KIND_LABEL] ?? store.kind}
          </Badge>
          <Badge tone="neutral">{store.status}</Badge>
          {listing?.invitePending ? (
            <Badge tone="neutral">Invite pending</Badge>
          ) : (
            <Badge tone="neutral">
              {listing?.memberCount ?? 0}{" "}
              {(listing?.memberCount ?? 0) === 1 ? "member" : "members"}
            </Badge>
          )}
          {location && <Badge tone="neutral">{location}</Badge>}
          {!isVendor && <Badge tone="neutral">{store.timezone}</Badge>}
        </div>
      </div>

      {isVendor ? <VendorSections storeId={store.id} /> : <LgsSections store={store} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Game store: the room right now, the counter code, the events               */
/* -------------------------------------------------------------------------- */

async function LgsSections({
  store,
}: {
  store: { id: string; name: string; join_code: string; timezone: string };
}) {
  const [resolution, events, qrSvg] = await Promise.all([
    resolveCode(store.join_code),
    listEventsForStore(store.id),
    joinQrSvg(store.join_code),
  ]);

  const attendance = await countParticipants(events.map((event) => event.id));

  return (
    <>
      <section className="flex flex-col gap-5" aria-labelledby="room-now-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="room-now-heading" className="text-xl font-bold text-text-primary">
            Right now
          </h2>
          <p className="text-sm text-text-secondary">
            The room as a player in it sees it — names, Flares and who is open to
            trades. Binders stay private, in here as everywhere.
          </p>
        </div>

        {resolution.outcome === "room" ? (
          <LiveRoom room={resolution.room} joinCode={store.join_code} />
        ) : (
          <Card className="flex flex-col gap-1 py-8 text-center">
            <p className="font-semibold text-text-primary">No room live right now</p>
            <p className="text-sm text-text-secondary">
              {resolution.outcome === "quiet"
                ? "The store has walk-in trading switched off, and no event is running."
                : "The counter code is ready. A room opens the moment the first player joins."}
            </p>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="counter-code-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="counter-code-heading" className="text-xl font-bold text-text-primary">
            Counter code
          </h2>
          <p className="text-sm text-text-secondary">
            The same sheet the store prints from its own dashboard.
          </p>
        </div>

        <JoinPoster
          kind="counter"
          title={store.name}
          joinCode={store.join_code}
          url={joinUrl(store.join_code)}
          qrSvg={qrSvg}
        />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="store-events-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="store-events-heading" className="text-xl font-bold text-text-primary">
            Events
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {events.length} total
          </span>
        </div>

        <EventList
          events={events}
          fallbackTimeZone={store.timezone}
          attendance={attendance}
        />
      </section>
    </>
  );
}

async function LiveRoom({
  room,
  joinCode,
}: {
  room: { id: string; name: string };
  joinCode: string;
}) {
  const [participants, flares] = await Promise.all([
    listParticipants(room.id),
    listRoomFlares(room.id),
  ]);

  const openPlayers = participants
    .filter((participant) => participant.openToTrades)
    .map((participant) => ({
      playerSessionId: participant.playerSessionId,
      displayName: participant.displayName,
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge>
          <span className="size-1.5 rounded-full bg-accent" />
          Live · {room.name}
        </Badge>
        <Link
          href={`/e/${joinCode}`}
          className="text-sm text-text-muted underline underline-offset-4 hover:text-text-secondary"
        >
          Open the room page
        </Link>
      </div>

      <RoomRoster participants={participants} />

      <FlareBoard
        entries={flares}
        code={joinCode}
        imagesEnabled={cardImagesEnabled()}
        youId=""
        matches={new Map()}
        offers={new Map()}
        openToTrades={openPlayers}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vendor: booths claimed, inventory as buyers will find it                   */
/* -------------------------------------------------------------------------- */

async function VendorSections({ storeId }: { storeId: string }) {
  const [booths, shows, inventory] = await Promise.all([
    boothsForStore(storeId),
    listShows(),
    listInventory(storeId),
  ]);

  const claimed = shows.filter((show) => booths.has(show.id));

  return (
    <>
      <section className="flex flex-col gap-5" aria-labelledby="booths-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="booths-heading" className="text-xl font-bold text-text-primary">
            Shows & booths
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {claimed.length} claimed
          </span>
        </div>

        <VendorBooths claimed={claimed} booths={booths} />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="inventory-heading">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="inventory-heading" className="text-xl font-bold text-text-primary">
              Inventory
            </h2>
            <p className="text-sm text-text-secondary">
              What an attendee&rsquo;s search can find, exactly as the vendor listed it.
              Read-only &mdash; the list is theirs to manage.
            </p>
          </div>
          <span className="shrink-0 text-sm text-text-muted tabular-nums">
            {inventory.length} {inventory.length === 1 ? "line" : "lines"}
          </span>
        </div>

        <VendorInventoryReadonly inventory={inventory} />
      </section>
    </>
  );
}
