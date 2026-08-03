import type { Metadata } from "next";
import Link from "next/link";
import { Store as StoreIcon } from "lucide-react";

import { CatalogHealth } from "@/components/admin/catalog-health";
import { ConfigStatus } from "@/components/admin/config-status";
import { InviteStoreForm } from "@/components/admin/invite-store-form";
import { SyncCatalogForm } from "@/components/admin/sync-catalog-form";
import { CreateEventForm } from "@/components/events/create-event-form";
import { CreateShowForm } from "@/components/shows/create-show-form";
import { EventList } from "@/components/events/event-list";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { catalogBySet, failuresForRun } from "@/lib/cards/health";
import {
  DON_EXCLUSION,
  OptcgApiProvider,
} from "@/lib/cards/providers/optcgapi/adapter";
import { countCards, countPrintingImages } from "@/lib/cards/search";
import { latestSyncRun } from "@/lib/cards/sync";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { listAllEvents } from "@/lib/events/repository";
import { listShows } from "@/lib/shows/repository";
import { listStores } from "@/lib/stores/repository";
import type { StoreListing } from "@/lib/stores/repository";
import { formatEventWindow } from "@/lib/events/format";
import { knownTimeZones } from "@/lib/time/zone";

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
  const [stores, events, cardCount, lastRun, printingImages, shows] = await Promise.all(
    [
      listStores(),
      listAllEvents(),
      countCards(),
      latestSyncRun(),
      countPrintingImages(),
      listShows(),
    ],
  );

  const storeNames = Object.fromEntries(stores.map((store) => [store.id, store.name]));
  const attendance = await countParticipants(events.map((event) => event.id));
  // The admin console spans every store, so each row is formatted in the
  // zone of the store that owns it rather than in the viewer's.
  const timeZones = Object.fromEntries(stores.map((s) => [s.id, s.timezone]));
  const window = defaultEventWindow("UTC");
  const providerName = new OptcgApiProvider().displayName;

  // Depends on which run was last, so it cannot join the batch above.
  const [setCoverage, failures] = await Promise.all([
    catalogBySet(),
    lastRun ? failuresForRun(lastRun.id) : { groups: [], total: 0, truncated: false },
  ]);

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
            Card data only — no prices, and no artwork is copied. {DON_EXCLUSION}
          </p>
        </div>

        <Card>
          <SyncCatalogForm providerName={providerName} />
        </Card>

        <CatalogHealth
          sets={setCoverage.sets}
          setsTruncated={setCoverage.truncated}
          failures={failures}
          recordsSeen={lastRun?.records_seen ?? 0}
        />

        {cardCount > 0 && (
          <p className="text-sm text-text-secondary">
            Zero rejections means every record parsed, not that any value is right.{" "}
            <Link href="/admin/spot-check" className="text-accent hover:underline">
              Spot check a spread of cards
            </Link>{" "}
            against the official card list.
          </p>
        )}
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
          timeZones={timeZones}
          attendance={attendance}
        />
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="shows-heading">
        <div className="flex flex-col gap-1">
          <h2 id="shows-heading" className="text-xl font-bold text-text-primary">
            Card shows
          </h2>
          <p className="text-sm text-text-secondary">
            One code per show. Vendors claim booths from their dashboard; attendees scan
            and search.
          </p>
        </div>

        <Card>
          <CreateShowForm
            zones={knownTimeZones("UTC")}
            defaultZone="UTC"
            defaultStartsAt={window.startsAt}
            defaultEndsAt={window.endsAt}
          />
        </Card>

        {shows.length > 0 && (
          <Card className="p-4">
            <ul className="flex flex-col">
              {shows.map((show) => (
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
                  <Badge tone="neutral">{show.join_code}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
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
