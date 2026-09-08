import type { Metadata } from "next";

import { CreateEventForm } from "@/components/events/create-event-form";
import { EventList } from "@/components/events/event-list";
import { AppShell } from "@/components/layout/app-shell";
import { StoreTabs } from "@/components/stores/store-tabs";
import { Card } from "@/components/ui/card";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listEventsForStore } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { loadStoreConsole } from "@/lib/stores/console";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The Events tab: tonight's, the next ones, and the form for a new one. */
export default async function StoreEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/events",
  );
  if (!store || store.kind === "vendor") return null;

  await sweepStaleRooms();
  const events = await listEventsForStore(store.id);
  const attendance = await countParticipants(events.map((event) => event.id));
  const timeZone = store.timezone ?? "UTC";
  const window = defaultEventWindow(timeZone);

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
        <Card>
          <CreateEventForm
            storeId={store.id}
            defaultStartsAt={window.startsAt}
            defaultEndsAt={window.endsAt}
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
          events={events}
          attendance={attendance}
          fallbackTimeZone={timeZone}
        />
      </section>
    </AppShell>
  );
}
