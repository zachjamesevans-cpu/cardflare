import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Flame,
  Radio,
  Store as StoreIcon,
  Tent,
  UserRound,
  Users,
} from "lucide-react";

import { CatalogHealth } from "@/components/admin/catalog-health";
import { AreaLink, StatTile } from "@/components/admin/glance";
import { ConfigStatus } from "@/components/admin/config-status";
import { SyncCatalogForm } from "@/components/admin/sync-catalog-form";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { catalogBySet, failuresForRun } from "@/lib/cards/health";
import {
  DON_EXCLUSION,
  OptcgApiProvider,
} from "@/lib/cards/providers/optcgapi/adapter";
import { countCards, countPrintingImages } from "@/lib/cards/search";
import { latestSyncRun } from "@/lib/cards/sync";
import { countParticipants } from "@/lib/events/participants";
import { listAllEvents } from "@/lib/events/repository";
import { listLiveRooms, sweepStaleRooms } from "@/lib/events/rooms";
import { countOpenFlares } from "@/lib/lists/repository";
import { listPlayersForAdmin } from "@/lib/players/accounts";
import { listClaimableShows, listShows } from "@/lib/shows/repository";
import { listStores } from "@/lib/stores/repository";

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

/**
 * The console's front page: tonight's numbers, then doors into the lists.
 *
 * Deliberately short. The old page stacked every store, every event and
 * every show on one scroll, and the thing an admin actually opens it for —
 * "is anything happening right now?" — was nowhere. The lists live one
 * click away at /admin/stores, /admin/events and /admin/shows.
 */
export default async function AdminPage() {
  await requireAdmin();

  // Rooms close lazily; the console render is one of the moments that does
  // it, so the numbers below describe now rather than the last scan.
  await sweepStaleRooms();

  const [
    stores,
    events,
    shows,
    runningShows,
    liveRooms,
    cardCount,
    lastRun,
    printingImages,
  ] = await Promise.all([
    listStores(),
    listAllEvents(),
    listShows(),
    listClaimableShows(),
    listLiveRooms(),
    countCards(),
    latestSyncRun(),
    countPrintingImages(),
  ]);

  /*
   * The list applies the walk-in switch (the summary is read-only and does
   * not know it), so a room at a store that turned walk-ins off does not
   * count as live here either.
   */
  const walkInEnabled = new Map(stores.map((s) => [s.id, s.walk_in_enabled]));
  const live = liveRooms.filter(
    (room) => room.kind === "scheduled" || walkInEnabled.get(room.storeId),
  );

  const [flareCounts, presence] = await Promise.all([
    countOpenFlares(live.map((room) => room.eventId)),
    countParticipants(live.map((room) => room.eventId)),
  ]);

  const flaresOut = [...flareCounts.values()].reduce((sum, n) => sum + n, 0);
  const hereNow = live.reduce(
    (sum, room) => sum + (presence.get(room.eventId)?.present ?? 0),
    0,
  );

  const { players: playerAccounts } = await listPlayersForAdmin();
  const playerCount = playerAccounts.length;

  const gameStores = stores.filter((store) => store.kind === "lgs").length;
  const vendors = stores.length - gameStores;
  const upcomingShows = runningShows.length;

  const providerName = new OptcgApiProvider().displayName;

  // Depends on which run was last, so it cannot join the batch above.
  const [setCoverage, failures] = await Promise.all([
    catalogBySet(),
    lastRun ? failuresForRun(lastRun.id) : { groups: [], total: 0, truncated: false },
  ]);

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-5" aria-labelledby="glance-heading">
        <h2 id="glance-heading" className="text-xl font-bold text-text-primary">
          Right now
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile
            icon={Radio}
            label="Live rooms"
            value={live.length}
            live={live.length > 0}
          />
          <StatTile icon={Flame} label="Flares out" value={flaresOut} />
          <StatTile icon={Users} label="Players here now" value={hereNow} />
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="areas-heading">
        <h2 id="areas-heading" className="text-xl font-bold text-text-primary">
          Manage
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AreaLink
            href="/admin/stores"
            icon={StoreIcon}
            label="Stores & vendors"
            value={stores.length}
            detail={`${gameStores} game ${gameStores === 1 ? "store" : "stores"} · ${vendors} ${vendors === 1 ? "vendor" : "vendors"}`}
          />
          <AreaLink
            href="/admin/events"
            icon={CalendarDays}
            label="Events"
            value={events.length}
            detail="Create one, or read the history"
          />
          <AreaLink
            href="/admin/shows"
            icon={Tent}
            label="Card shows"
            value={shows.length}
            detail={`${upcomingShows} upcoming or running`}
          />
          <AreaLink
            href="/admin/players"
            icon={UserRound}
            label="Players"
            value={playerCount}
            detail="Invite-only accounts"
          />
        </div>
      </section>

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
    </div>
  );
}
