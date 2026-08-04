import Link from "next/link";
import { Flame } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import type { LiveRoom } from "@/lib/events/rooms";
import type { StoreListing } from "@/lib/stores/repository";

/**
 * The operator list, split by what each one is.
 *
 * Two kinds of operator answer two different questions — "which of my stores
 * has a room running tonight" and "which vendors are set for the weekend" —
 * so they read as two lists rather than one pile.
 */
export function StoreGroups({
  stores,
  liveRooms,
  flareCounts,
}: {
  stores: StoreListing[];
  liveRooms: LiveRoom[];
  /** Open Flares per live room, keyed by event id. */
  flareCounts?: Map<string, number>;
}) {
  /*
   * The summary is read-only and does not know a store's walk-in switch, so
   * the switch is applied here: a walk-in room at a store that has since
   * turned walk-ins off is the one the scan path would close, not a live one.
   */
  const liveByStore = new Map(liveRooms.map((room) => [room.storeId, room] as const));

  const groups = [
    { label: "Game stores", kind: "lgs" },
    { label: "Card-show vendors", kind: "vendor" },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => {
        const members = stores.filter((store) => store.kind === group.kind);

        return (
          <div key={group.kind} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold tracking-wider text-text-muted uppercase">
                {group.label}
              </h3>
              <span className="text-sm text-text-muted tabular-nums">
                {members.length}
              </span>
            </div>

            {members.length === 0 ? (
              <p className="text-sm text-text-muted">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {members.map((store) => {
                  const room = liveByStore.get(store.id);
                  const live =
                    room && (room.kind === "scheduled" || store.walk_in_enabled);

                  return (
                    <StoreRow
                      key={store.id}
                      store={store}
                      liveRoomName={live ? room.name : null}
                      flares={live ? (flareCounts?.get(room.eventId) ?? 0) : null}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StoreRow({
  store,
  liveRoomName,
  flares,
}: {
  store: StoreListing;
  liveRoomName: string | null;
  /** Open Flares in the live room; null when no room is live. */
  flares: number | null;
}) {
  const location = [store.city, store.region].filter(Boolean).join(", ");

  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/admin/stores/${store.id}`}
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {store.name}
        </Link>
        <p className="truncate text-sm text-text-muted">
          {store.contact_email}
          {location && ` · ${location}`}
        </p>
      </div>

      {/* Wraps rather than shrink-0: the live badge carries a room name, and
          on a phone that plus three status badges cannot share one line. */}
      <div className="flex flex-wrap items-center gap-2">
        {liveRoomName && (
          <Badge>
            <span className="size-1.5 rounded-full bg-accent" />
            Live · {liveRoomName}
          </Badge>
        )}
        {flares !== null && (
          <Badge tone="neutral">
            <Flame className="size-3.5" aria-hidden="true" />
            {flares} {flares === 1 ? "Flare" : "Flares"} out
          </Badge>
        )}
        {store.invitePending ? (
          <Badge tone="neutral">Invite pending</Badge>
        ) : (
          <Badge tone="neutral">
            {store.memberCount} {store.memberCount === 1 ? "member" : "members"}
          </Badge>
        )}
        <Badge tone="neutral">{store.status}</Badge>
      </div>
    </Card>
  );
}
