import Link from "next/link";
import { ArrowLeftRight, MapPin, Users } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge, Card } from "@/components/ui/card";
import type { Participant } from "@/lib/events/participants";
import { formatEventWindow } from "@/lib/events/format";
import type { InventoryLine } from "@/lib/shows/repository";
import { slabLabel } from "@/lib/shows/schema";
import type { ShowRow } from "@/lib/supabase/types";

/** Inventory rows shown before the list just states the remainder. */
export const INVENTORY_PREVIEW = 100;

/**
 * Who is in the room, read-only.
 *
 * Not the room's own lobby component: that one carries a working "leave this
 * room" form, which would be a dead control for a viewer who never joined.
 */
export function RoomRoster({ participants }: { participants: Participant[] }) {
  const present = participants.filter((participant) => participant.present).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-text-primary">
          <Users className="size-4 text-text-muted" aria-hidden="true" />
          In this room
        </h3>
        <Badge tone={present > 0 ? "accent" : "neutral"}>
          {present} here now
          {participants.length !== present && ` · ${participants.length} total`}
        </Badge>
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-text-secondary">Nobody has joined yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {participants.map((participant) => (
            <li
              key={participant.playerSessionId}
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-1 py-1.5"
            >
              <PlayerAvatar
                displayName={participant.displayName}
                seed={participant.playerSessionId}
                size="sm"
                className={participant.present ? undefined : "opacity-50"}
              />
              <span className="min-w-0 flex-1 truncate text-text-secondary">
                <span className={participant.present ? "text-text-primary" : undefined}>
                  {participant.displayName}
                </span>
              </span>
              {participant.openToTrades && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-accent">
                  <ArrowLeftRight className="size-3.5" aria-hidden="true" />
                  Open to trades
                </span>
              )}
              {!participant.present && (
                <span className="shrink-0 text-xs text-text-muted">away</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The shows a vendor has claimed a booth at, linked to each show's page. */
export function VendorBooths({
  claimed,
  booths,
}: {
  claimed: ShowRow[];
  booths: Map<string, string>;
}) {
  if (claimed.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <MapPin className="size-6 text-text-muted" aria-hidden="true" />
        <p className="text-text-secondary">
          No booth claimed yet. The vendor picks their shows from their dashboard.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <ul className="flex flex-col">
        {claimed.map((show) => (
          <li
            key={show.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 basis-48 flex-col">
              <Link
                href={`/admin/shows/${show.id}`}
                className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
              >
                {show.name}
              </Link>
              <span className="text-xs text-text-muted">
                {formatEventWindow(show.starts_at, show.ends_at, show.timezone)}
              </span>
            </div>
            <Badge>Booth {booths.get(show.id)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A vendor's inventory, exactly as their dashboard lists it, minus controls. */
export function VendorInventoryReadonly({ inventory }: { inventory: InventoryLine[] }) {
  if (inventory.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-text-secondary">Nothing uploaded yet.</p>
      </Card>
    );
  }

  const preview = inventory.slice(0, INVENTORY_PREVIEW);

  return (
    <Card className="p-4">
      <ul className="flex flex-col">
        {preview.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 basis-48 flex-col">
              <span className="truncate font-semibold text-text-primary">
                {line.cardName}
                {line.quantity > 1 && (
                  <span className="font-normal text-text-muted tabular-nums">
                    {" "}
                    ×{line.quantity}
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-text-muted">
                {line.cardNumber}
                {line.printingLabel && (
                  <span className="font-sans"> · {line.printingLabel}</span>
                )}
              </span>
            </div>
            <Badge tone={line.form === "slab" ? "accent" : "neutral"}>
              {slabLabel(line.form, line.grader, line.grade)}
            </Badge>
          </li>
        ))}
      </ul>
      {inventory.length > preview.length && (
        <p className="border-t border-border pt-3 text-sm text-text-muted">
          …and {inventory.length - preview.length} more lines.
        </p>
      )}
    </Card>
  );
}
