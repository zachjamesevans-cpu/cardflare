import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import {
  ORGANIZER_DESCRIPTION,
  OrganizerList,
} from "@/components/stores/organizer-list";
import { AddOrganizer } from "@/components/stores/organizers";
import { StoreTabs } from "@/components/stores/store-tabs";
import { Card } from "@/components/ui/card";
import { loadStoreConsole } from "@/lib/stores/console";
import { listStaff } from "@/lib/stores/staff";

export const metadata: Metadata = {
  title: "Organizers",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Organizers tab: who runs the nights.
 *
 * Owner-only. `loadStoreConsole` already turns an organizer away from
 * this path on the server; the check below is the same lock written
 * where a reader of this file expects to find it, so the page cannot
 * be copied somewhere the loader's list does not cover.
 */
export default async function StoreOrganizersPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/organizers",
  );
  if (!store || store.kind === "vendor") return null;
  if (store.role !== "owner") redirect(`/store?as=${store.id}`);

  const staff = await listStaff(store.id);
  const memberPlayerIds = staff
    .map((member) => member.playerId)
    .filter((id): id is string => id !== null);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Organizers"
      description="The people who run your tournament nights, and what they can touch."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-text-primary">Organizers</h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {ORGANIZER_DESCRIPTION} They cannot add or remove other organizers. They
            keep their player profile, with a small TO badge that says they run
            tournaments here.
          </p>
        </div>

        <OrganizerList storeId={store.id} members={staff} />
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-text-primary">Add an organizer</h2>
          <p className="text-sm text-text-secondary">
            Search for a player. They need a cardflare account first.
          </p>
        </div>
        <AddOrganizer storeId={store.id} memberPlayerIds={memberPlayerIds} />
      </Card>
    </AppShell>
  );
}
