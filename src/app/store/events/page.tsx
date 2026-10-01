import type { Metadata } from "next";
import { CalendarX } from "lucide-react";

import { CreateEventForm } from "@/components/events/create-event-form";
import { EventHistoryToggle } from "@/components/events/event-history-toggle";
import { EventList } from "@/components/events/event-list";
import { TimeZonePicker } from "@/components/events/timezone-picker";
import { TimezoneSuggest } from "@/components/events/timezone-suggest";
import { AppShell } from "@/components/layout/app-shell";
import { StoreTabs } from "@/components/stores/store-tabs";
import { Card } from "@/components/ui/card";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listEventsForStore } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { NO_TIMEZONE } from "@/lib/events/schema";
import { loadStoreConsole } from "@/lib/stores/console";
import type { EventRow } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A walk-in session that opened and closed in the same instant: a scan
 * that started a room nobody used. It is not a night the store ran, so
 * it is not listed, even under history.
 */
function isEmptySession(event: EventRow): boolean {
  return event.kind === "walk_in" && event.ends_at === event.starts_at;
}

/** A finished walk-in session: the store's history, one tap away. */
function isHistory(event: EventRow): boolean {
  return event.kind === "walk_in" && event.status === "closed";
}

/** The Events tab: tonight's, the next ones, and the form for a new one. */
export default async function StoreEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; cancelled?: string }>;
}) {
  const { as, cancelled } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/events",
  );
  if (!store || store.kind === "vendor") return null;

  await sweepStaleRooms();
  const events = (await listEventsForStore(store.id)).filter(
    (event) => !isEmptySession(event),
  );
  const attendance = await countParticipants(events.map((event) => event.id));
  const timeZone = store.timezone ?? "UTC";
  const noZone = timeZone === "UTC";
  const window = defaultEventWindow(timeZone);

  /* Scheduled nights and the open walk-in room always show; finished
     walk-in sessions fold away behind one line. */
  const current = events.filter((event) => !isHistory(event));
  const history = events.filter(isHistory);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Events"
      description="A room for every night you run. Your counter code sends players to whichever one is on."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      {/* The cancel action lands here with the night's name, so the tab
          says what just happened instead of a row quietly going grey. */}
      {cancelled && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm font-semibold text-text-secondary"
        >
          <CalendarX className="size-4 text-text-muted" aria-hidden="true" />
          {cancelled} was cancelled.
        </p>
      )}

      <section className="flex flex-col gap-5" aria-labelledby="new-event-heading">
        <div className="flex flex-col gap-1">
          <h2 id="new-event-heading" className="text-xl font-bold text-text-primary">
            New event
          </h2>
          <p className="text-sm text-text-secondary">
            For a tournament or a prerelease: its own name, its own window, and its own
            sheet. An ordinary afternoon needs nothing; the counter code already covers
            it.
          </p>
        </div>

        {/* No zone, no night: the server refuses a night from a store on
            the UTC default, so the fix sits above the form, one tap. */}
        {noZone && (
          <TimezoneSuggest
            storeId={store.id}
            message={NO_TIMEZONE}
            picker={<TimeZonePicker storeId={store.id} timeZone={timeZone} />}
          />
        )}

        <Card>
          <CreateEventForm
            storeId={store.id}
            defaultStartsAt={window.startsAt}
            defaultEndsAt={window.endsAt}
            disabled={noZone}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="events-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="events-heading" className="text-xl font-bold text-text-primary">
            Your events
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {events.length} total
          </span>
        </div>
        <EventList
          events={current}
          attendance={attendance}
          fallbackTimeZone={timeZone}
        />
        {history.length > 0 && (
          <EventHistoryToggle count={history.length}>
            <EventList
              events={history}
              attendance={attendance}
              fallbackTimeZone={timeZone}
            />
          </EventHistoryToggle>
        )}
      </section>
    </AppShell>
  );
}
