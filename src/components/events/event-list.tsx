import Link from "next/link";
import { CalendarDays, DoorOpen, Users } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { formatEventWindow } from "@/lib/events/format";
import { STATUS_LABELS } from "@/lib/events/schema";
import type { EventRow } from "@/lib/supabase/types";

export function EventRowCard({
  event,
  storeName,
  timeZone,
  attendance,
}: {
  event: EventRow;
  storeName?: string;
  /** The owning store's zone. An event time without one is a wrong time. */
  timeZone: string;
  attendance?: { total: number; present: number };
}) {
  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/store/events/${event.id}`}
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {event.name}
        </Link>
        <p className="truncate text-sm text-text-muted">
          {storeName ? `${storeName} · ` : ""}
          {formatEventWindow(event.starts_at, event.ends_at, timeZone)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {attendance && attendance.total > 0 && (
          <span
            className="flex items-center gap-1.5 text-sm text-text-muted tabular-nums"
            title={`${attendance.present} here now of ${attendance.total} joined`}
          >
            <Users className="size-4" aria-hidden="true" />
            {attendance.present}
            <span className="sr-only">
              players here now, {attendance.total} joined in total
            </span>
          </span>
        )}
        {/*
         * A walk-in room has no code of its own — it is reached through the
         * store's counter code — so it is labelled by what it is instead.
         */}
        {event.join_code ? (
          <code className="rounded-[var(--radius-control)] border border-border bg-elevated px-2.5 py-1 text-sm font-semibold tracking-[0.15em] text-text-primary">
            {event.join_code}
          </code>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-text-muted">
            <DoorOpen className="size-4" aria-hidden="true" />
            Walk-in
          </span>
        )}
        <Badge tone={event.status === "open" ? "accent" : "neutral"}>
          {STATUS_LABELS[event.status]}
        </Badge>
      </div>
    </Card>
  );
}

export function EventList({
  events,
  showStore = false,
  storeNames,
  timeZones,
  fallbackTimeZone = "UTC",
  attendance,
}: {
  events: EventRow[];
  showStore?: boolean;
  storeNames?: Record<string, string>;
  /**
   * Zone per store, for the admin console where one list spans many stores.
   * A single store's dashboard passes `fallbackTimeZone` instead.
   */
  timeZones?: Record<string, string>;
  fallbackTimeZone?: string;
  attendance?: Map<string, { total: number; present: number }>;
}) {
  if (events.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <CalendarDays className="size-6 text-text-muted" aria-hidden="true" />
        <p className="text-text-secondary">No events yet.</p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <EventRowCard
          key={event.id}
          event={event}
          storeName={showStore ? storeNames?.[event.store_id] : undefined}
          timeZone={timeZones?.[event.store_id] ?? fallbackTimeZone}
          attendance={attendance?.get(event.id)}
        />
      ))}
    </ul>
  );
}
