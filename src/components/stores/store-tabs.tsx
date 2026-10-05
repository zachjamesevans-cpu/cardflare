import { getViewer } from "@/lib/auth/session";
import { consoleRole } from "@/lib/stores/console";
import { GiftBar } from "./gift-bar";
import { StoreTabsNav, type StoreTabId } from "./store-tabs-nav";

/**
 * The console's tabs, for whoever is standing at it.
 *
 * A Server Component so the list is decided from the viewer's own
 * session rather than from a prop a page might forget to pass: every
 * console page renders `<StoreTabs storeId={...} />` and gets the right
 * tabs for that person at that store. An OWNER sees all eight. An
 * ORGANIZER (role "staff", the TO badge) sees five: the overview,
 * FlareCast, the events, the posts and the case, because those are
 * what they run; singles, the organizers list and settings are the
 * owner's, and `loadStoreConsole` turns an organizer away from those
 * pages on the server regardless of what is drawn here.
 */
const OWNER_TABS: StoreTabId[] = [
  "overview",
  "event-hub",
  "events",
  "posts",
  "case",
  "singles",
  "organizers",
  "settings",
];

/* Posts are theirs too: "OP-12 prerelease Saturday, 20 seats" is the
   organizer's news as much as the owner's. */
const ORGANIZER_TABS: StoreTabId[] = [
  "overview",
  "event-hub",
  "events",
  "posts",
  "case",
];

export async function StoreTabs({ storeId }: { storeId: string }) {
  const viewer = await getViewer();
  const role = consoleRole(viewer, storeId);

  /* The green bar sits above the tabs on every console page, in its own
     column so it spans the full width whatever row the tabs land in. */
  return (
    <div className="flex w-full flex-col gap-4">
      <GiftBar storeId={storeId} owner={role === "owner"} />
      <StoreTabsNav
        storeId={storeId}
        tabs={role === "owner" ? OWNER_TABS : ORGANIZER_TABS}
      />
    </div>
  );
}
