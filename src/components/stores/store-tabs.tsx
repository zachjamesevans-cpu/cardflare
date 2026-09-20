import { getViewer } from "@/lib/auth/session";
import { consoleRole } from "@/lib/stores/console";
import { StoreTabsNav, type StoreTabId } from "./store-tabs-nav";

/**
 * The console's tabs, for whoever is standing at it.
 *
 * A Server Component so the list is decided from the viewer's own
 * session rather than from a prop a page might forget to pass: every
 * console page renders `<StoreTabs storeId={...} />` and gets the right
 * tabs for that person at that store. An OWNER sees all six. An
 * ORGANIZER (role "staff", the TO badge) sees the overview, FlareCast
 * and the events, because those are what they run; singles, the
 * organizers list and settings are the owner's, and `loadStoreConsole`
 * turns an organizer away from those pages on the server regardless
 * of what is drawn here.
 */
const OWNER_TABS: StoreTabId[] = [
  "overview",
  "event-hub",
  "events",
  "singles",
  "organizers",
  "settings",
];

const ORGANIZER_TABS: StoreTabId[] = ["overview", "event-hub", "events"];

export async function StoreTabs({ storeId }: { storeId: string }) {
  const viewer = await getViewer();
  const role = consoleRole(viewer, storeId);

  return (
    <StoreTabsNav
      storeId={storeId}
      tabs={role === "owner" ? OWNER_TABS : ORGANIZER_TABS}
    />
  );
}
