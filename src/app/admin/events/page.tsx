import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreateEventForm } from "@/components/events/create-event-form";
import { EventList } from "@/components/events/event-list";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listAllEvents } from "@/lib/events/repository";
import { listStores } from "@/lib/stores/repository";

export const metadata: Metadata = {
  title: "Events",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Every event across every store, and the form that creates the next one. */
export default async function AdminEventsPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const [stores, events] = await Promise.all([listStores(), listAllEvents()]);
  const attendance = await countParticipants(events.map((event) => event.id));

  const storeNames = Object.fromEntries(stores.map((store) => [store.id, store.name]));
  // Each row is formatted in the zone of the store that owns it.
  const timeZones = Object.fromEntries(stores.map((s) => [s.id, s.timezone]));
  const window = defaultEventWindow("UTC");

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Events</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          Every event across every store. The first pilot needs nothing from the store
          but the printed sheet.
        </p>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="new-event-heading">
        <h3 id="new-event-heading" className="text-lg font-bold text-text-primary">
          New event
        </h3>

        <Card>
          {stores.length === 0 ? (
            <p className="text-text-secondary">
              <Link href="/admin/stores" className="text-accent hover:underline">
                Invite a store
              </Link>{" "}
              first — an event has to belong to one.
            </p>
          ) : (
            <CreateEventForm
              stores={stores.map((store) => ({ id: store.id, name: store.name }))}
              defaultStartsAt={window.startsAt}
              defaultEndsAt={window.endsAt}
            />
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="events-heading">
        <div className="flex items-center justify-between gap-4">
          <h3 id="events-heading" className="text-lg font-bold text-text-primary">
            All events
          </h3>
          <span className="text-sm text-text-muted tabular-nums">
            {events.length} total
          </span>
        </div>

        <EventList
          events={events}
          showStore
          storeNames={storeNames}
          timeZones={timeZones}
          attendance={attendance}
        />
      </section>
    </div>
  );
}
