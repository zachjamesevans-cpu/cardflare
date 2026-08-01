import type { Metadata } from "next";
import { Store as StoreIcon } from "lucide-react";

import { ConfigStatus } from "@/components/admin/config-status";
import { InviteStoreForm } from "@/components/admin/invite-store-form";
import { SyncCatalogForm } from "@/components/admin/sync-catalog-form";
import { CreateEventForm } from "@/components/events/create-event-form";
import { EventList } from "@/components/events/event-list";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";
import { countCards, countPrintingImages } from "@/lib/cards/search";
import { latestSyncRun } from "@/lib/cards/sync";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listAllEvents } from "@/lib/events/repository";
import { listStores } from "@/lib/stores/repository";
import type { StoreListing } from "@/lib/stores/repository";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin data must never be cached or prerendered — it is per-request and
 * privileged. `requireAdmin` reads cookies, which already forces dynamic
 * rendering, but saying so here makes the intent explicit.
 */
export const dynamic = "force-dynamic";

/**
 * Server Actions invoked from this page inherit its time limit, and the
 * catalog sync is the one that needs more than a default. 60 seconds is the
 * ceiling every Vercel plan allows, so this cannot fail a deploy; a full
 * catalog pull may still outlive it, which is why an abandoned run is
 * recoverable and re-running is idempotent.
 */
export const maxDuration = 60;

export default async function AdminPage() {
  await requireAdmin();
  const [stores, events, cardCount, lastRun, printingImages] = await Promise.all([
    listStores(),
    listAllEvents(),
    countCards(),
    latestSyncRun(),
    countPrintingImages(),
  ]);

  const storeNames = Object.fromEntries(stores.map((store) => [store.id, store.name]));
  const attendance = await countParticipants(events.map((event) => event.id));
  const window = defaultEventWindow();
  const providerName = new OptcgApiProvider().displayName;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-5" aria-labelledby="config-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="config-heading" className="text-xl font-bold text-text-primary">
            Configuration
          </h2>
          <p className="text-sm text-text-secondary">
            What this deployment can see. Changing a variable requires a redeploy before
            it shows up here.
          </p>
        </div>

        <ConfigStatus
          facts={{
            cardCount,
            printingImages,
            lastSync: lastRun
              ? {
                  status: lastRun.status,
                  mode: lastRun.mode,
                  finishedAt: lastRun.finished_at,
                }
              : null,
          }}
        />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="sync-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="sync-heading" className="text-xl font-bold text-text-primary">
            Card catalog
          </h2>
          <p className="text-sm text-text-secondary">
            Imports One Piece cards from {providerName} so search has something to find.
            Card data only — no prices, and no artwork is copied.
          </p>
        </div>

        <Card>
          <SyncCatalogForm providerName={providerName} />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="invite-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="invite-heading" className="text-xl font-bold text-text-primary">
            Invite a store
          </h2>
          <p className="text-sm text-text-secondary">
            Adds the store to the beta and emails the contact a sign-in link.
          </p>
        </div>

        <Card>
          <InviteStoreForm />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="new-event-heading">
        <div className="flex flex-col gap-1.5">
          <h2 id="new-event-heading" className="text-xl font-bold text-text-primary">
            New event
          </h2>
          <p className="text-sm text-text-secondary">
            Create an event for any store. The first pilot needs nothing from them but
            the printed sheet.
          </p>
        </div>

        <Card>
          {stores.length === 0 ? (
            <p className="text-text-secondary">
              Invite a store first — an event has to belong to one.
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
          <h2 id="events-heading" className="text-xl font-bold text-text-primary">
            Events
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {events.length} total
          </span>
        </div>

        <EventList
          events={events}
          showStore
          storeNames={storeNames}
          attendance={attendance}
        />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="stores-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="stores-heading" className="text-xl font-bold text-text-primary">
            Stores
          </h2>
          <span className="text-sm text-text-muted tabular-nums">
            {stores.length} total
          </span>
        </div>

        {stores.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <StoreIcon className="size-6 text-text-muted" aria-hidden="true" />
            <p className="text-text-secondary">
              No stores yet. Invite the first one above.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {stores.map((store) => (
              <StoreRow key={store.id} store={store} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StoreRow({ store }: { store: StoreListing }) {
  const location = [store.city, store.region].filter(Boolean).join(", ");

  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-text-primary">{store.name}</p>
        <p className="truncate text-sm text-text-muted">
          {store.contact_email}
          {location && ` · ${location}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {store.invitePending ? (
          <Badge tone="neutral">Invite pending</Badge>
        ) : (
          <Badge>
            {store.memberCount} {store.memberCount === 1 ? "member" : "members"}
          </Badge>
        )}
        <Badge tone="neutral">{store.status}</Badge>
      </div>
    </Card>
  );
}
