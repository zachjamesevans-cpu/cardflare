import { AppShell } from "@/components/layout/app-shell";
import { VendorInventoryForm } from "@/components/shows/vendor-inventory-form";
import { VendorInventoryList } from "@/components/shows/vendor-inventory-list";
import { VendorShows } from "@/components/shows/vendor-shows";
import { cardImagesEnabled } from "@/lib/cards/images";
import { viewerGames } from "@/lib/players/viewer-games";
import {
  boothsForStore,
  listClaimableShows,
  listInventory,
} from "@/lib/shows/repository";
import type { StoreConsole } from "@/lib/stores/console";

/**
 * A vendor's console: a different job from a shop's.
 *
 * No rooms, no counter code, no television: an inventory to state and
 * booths to claim, show by show. Same account machinery as the store
 * console, split where the difference becomes visible. Moved here
 * unchanged when the shop console grew tabs.
 */
export async function VendorConsole({ console }: { console: StoreConsole }) {
  const { viewer, areas, currentArea } = console;
  const store = console.store!;

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

        <VendorInventoryForm
          storeId={store.id}
          imagesEnabled={cardImagesEnabled()}
          playerGames={await viewerGames()}
        />
        <VendorInventoryList storeId={store.id} lines={lines} />
      </section>
    </AppShell>
  );
}
