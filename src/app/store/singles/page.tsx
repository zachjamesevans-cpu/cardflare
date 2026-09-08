import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { SyncSinglesForm } from "@/components/singles/sync-singles-form";
import { StoreTabs } from "@/components/stores/store-tabs";
import { singlesSyncFor } from "@/lib/singles/repository";
import { loadStoreConsole } from "@/lib/stores/console";

export const metadata: Metadata = {
  title: "Singles",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The Singles tab: the case, matched to the room. */
export default async function StoreSinglesPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    as,
    "/store/singles",
  );
  if (!store || store.kind === "vendor") return null;

  const sync = await singlesSyncFor(store.id);
  const timeZone = store.timezone ?? "UTC";
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
      title="Your singles"
      description="Upload your TCGplayer inventory export. When someone in your room posts a Flare for a card you stock, their Flare says your counter may have it."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />
      <SyncSinglesForm storeId={store.id} lastSync={lastSync} />
    </AppShell>
  );
}
