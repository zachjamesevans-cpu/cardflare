import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CreateEventForm } from "@/components/events/create-event-form";
import { EventList } from "@/components/events/event-list";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listEventsForStore } from "@/lib/events/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StorePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store");
  if (viewer.kind === "admin") redirect("/admin");

  if (viewer.kind === "unaffiliated") {
    return (
      <AppShell
        area="Store"
        email={viewer.user.email ?? ""}
        title="No store yet"
        description="This account is signed in but is not linked to a store."
      >
        <Card className="text-text-secondary">
          If you were invited, make sure you signed in with the same email address the
          invitation was sent to. Otherwise, get in touch and we will sort it out.
        </Card>
      </AppShell>
    );
  }

  // Reads through the user's own session, so Row Level Security decides what
  // comes back — a store can only ever see its own row.
  const supabase = await createSupabaseServerClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, city, region, status")
    .order("name");

  const store = stores?.[0];
  const events = store ? await listEventsForStore(store.id) : [];
  const attendance = await countParticipants(events.map((event) => event.id));
  const window = defaultEventWindow();

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={store?.name ?? "Your store"}
      description="Create an event, print its QR code, and players scan in."
    >
      <section className="flex flex-col gap-5" aria-labelledby="new-event-heading">
        <h2 id="new-event-heading" className="text-xl font-bold text-text-primary">
          New event
        </h2>

        <Card>
          {store ? (
            <CreateEventForm
              storeId={store.id}
              defaultStartsAt={window.startsAt}
              defaultEndsAt={window.endsAt}
            />
          ) : (
            <p className="text-text-secondary">
              We could not load your store. Try reloading, and get in touch if it
              persists.
            </p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="events-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="events-heading" className="text-xl font-bold text-text-primary">
            Events
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {events.length} total
          </span>
        </div>

        <EventList events={events} attendance={attendance} />
      </section>
    </AppShell>
  );
}
