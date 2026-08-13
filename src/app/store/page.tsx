import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CounterCode } from "@/components/events/counter-code";
import { SyncSinglesForm } from "@/components/singles/sync-singles-form";
import { VendorInventoryForm } from "@/components/shows/vendor-inventory-form";
import { VendorInventoryList } from "@/components/shows/vendor-inventory-list";
import { VendorShows } from "@/components/shows/vendor-shows";
import { EarlyBoardPicker } from "@/components/events/early-board-picker";
import { TimeZonePicker } from "@/components/events/timezone-picker";
import { CreateEventForm } from "@/components/events/create-event-form";
import { EventList } from "@/components/events/event-list";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { defaultEventWindow } from "@/lib/events/format";
import { countParticipants } from "@/lib/events/participants";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { listEventsForStore } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { cardImagesEnabled } from "@/lib/cards/images";
import {
  boothsForStore,
  listClaimableShows,
  listInventory,
} from "@/lib/shows/repository";
import { singlesSyncFor } from "@/lib/singles/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store");

  /*
   * An admin who is also a member of stores (the founder testing operator
   * features on their own account) gets the store dashboard like any other
   * member; an admin with no memberships has nothing to see here.
   */
  if (viewer.kind === "admin" && viewer.storeIds.length === 0) redirect("/admin");

  /*
   * A player account has no store — the "player" kind only exists when the
   * account holds no memberships — so the store dashboard can only ever be
   * an error card for them. Sign-in defaults land here, so this redirect is
   * what actually delivers a player to their account after logging in.
   */
  if (viewer.kind === "player") redirect("/profile");

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
    .select(
      "id, name, city, region, status, join_code, walk_in_enabled, timezone, kind, early_board_hours",
    )
    .order("name");

  /*
   * Which of this account's stores to show. The area switcher passes `?as=`;
   * anything not in the RLS-filtered list falls back to the first store, so
   * the parameter can never reach a store this account is not a member of.
   */
  const { as } = await searchParams;
  const store = stores?.find((row) => row.id === as) ?? stores?.[0];

  const areas = await areasForUser(viewer.user.id, viewer.kind === "admin");
  const currentArea = store ? `/store?as=${store.id}` : undefined;

  /*
   * A vendor's dashboard is a different job: no rooms, no counter code — an
   * inventory to state and booths to claim. Same account machinery, split
   * here where the difference becomes visible.
   */
  if (store?.kind === "vendor") {
    const [lines, shows, booths] = await Promise.all([
      listInventory(store.id),
      listClaimableShows(),
      boothsForStore(store.id),
    ]);

    return (
      <AppShell
        area="Store"
        email={viewer.user.email ?? ""}
        title={store.name}
        description="Upload what you're bringing, claim your booth, and attendees find you."
        areas={areas}
        currentArea={currentArea}
      >
        <section className="flex flex-col gap-5" aria-labelledby="shows-heading">
          <div className="flex flex-col gap-1">
            <h2 id="shows-heading" className="text-xl font-bold text-text-primary">
              Shows
            </h2>
            <p className="text-sm text-text-secondary">
              Claim a booth and everything below becomes findable by everyone who scans
              that show&rsquo;s code.
            </p>
          </div>
          <VendorShows storeId={store.id} shows={shows} booths={booths} />
        </section>

        <section className="flex flex-col gap-5" aria-labelledby="inventory-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="inventory-heading" className="text-xl font-bold text-text-primary">
              Your inventory
            </h2>
            <span className="text-sm text-text-muted tabular-nums">
              {lines.length} {lines.length === 1 ? "line" : "lines"}
            </span>
          </div>

          <VendorInventoryForm storeId={store.id} imagesEnabled={cardImagesEnabled()} />
          <VendorInventoryList storeId={store.id} lines={lines} />
        </section>
      </AppShell>
    );
  }

  // Close whatever ran out since anyone last looked, so the event list's
  // status badges tell the truth instead of echoing the last scan.
  await sweepStaleRooms();

  const events = store ? await listEventsForStore(store.id) : [];
  const attendance = await countParticipants(events.map((event) => event.id));
  const timeZone = store?.timezone ?? "UTC";
  const window = defaultEventWindow(timeZone);
  const counterQr = store ? await joinQrSvg(store.join_code) : null;

  const sync = store ? await singlesSyncFor(store.id) : null;
  const lastSync = sync
    ? {
        when: new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(new Date(sync.synced_at)),
        cardsMatched: sync.cards_matched,
        linesUnmatched: sync.lines_unmatched,
      }
    : null;

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={store?.name ?? "Your store"}
      description="One printed code on your counter, plus a room for every event you run."
      areas={areas}
      currentArea={currentArea}
    >
      {store && counterQr && (
        <section className="flex flex-col gap-5" aria-labelledby="counter-code-heading">
          <h2 id="counter-code-heading" className="text-xl font-bold text-text-primary">
            Your counter code
          </h2>

          <CounterCode
            storeId={store.id}
            storeName={store.name}
            joinCode={store.join_code}
            url={joinUrl(store.join_code)}
            qrSvg={counterQr}
            walkInEnabled={store.walk_in_enabled}
          />
        </section>
      )}

      {store && (
        <section className="flex flex-col gap-5" aria-labelledby="singles-heading">
          <div className="flex flex-col gap-1">
            <h2 id="singles-heading" className="text-xl font-bold text-text-primary">
              Your singles
            </h2>
            <p className="text-sm text-text-secondary">
              Upload your TCGplayer inventory export, and when someone in your room
              posts a Flare for a card you stock, their Flare says your counter may have
              it. Your case sells to the exact person looking for it.
            </p>
          </div>
          <SyncSinglesForm storeId={store.id} lastSync={lastSync} />
        </section>
      )}

      {store && (
        <section className="flex flex-col gap-5" aria-labelledby="timezone-heading">
          <h2 id="timezone-heading" className="text-xl font-bold text-text-primary">
            Where you are
          </h2>
          <TimeZonePicker storeId={store.id} timeZone={timeZone} />
        </section>
      )}

      {store && (
        <section className="flex flex-col gap-5" aria-labelledby="early-board-heading">
          <h2 id="early-board-heading" className="text-xl font-bold text-text-primary">
            Before your events
          </h2>
          <EarlyBoardPicker storeId={store.id} hours={store.early_board_hours} />
        </section>
      )}

      <section className="flex flex-col gap-5" aria-labelledby="new-event-heading">
        <div className="flex flex-col gap-1">
          <h2 id="new-event-heading" className="text-xl font-bold text-text-primary">
            New event
          </h2>
          {/*
           * Said out loud, because the counter code above makes it a fair
           * question. An event is worth creating when it has a name and a
           * window worth printing — a tournament, a prerelease — not for an
           * ordinary afternoon, which the counter code already covers.
           */}
          <p className="text-sm text-text-secondary">
            For a tournament or a prerelease: its own name, its own window, and its own
            sheet. Your counter code sends players here automatically while it is
            running.
          </p>
        </div>

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

        <EventList
          events={events}
          attendance={attendance}
          fallbackTimeZone={timeZone}
        />
      </section>
    </AppShell>
  );
}
