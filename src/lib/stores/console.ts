import "server-only";

import { redirect } from "next/navigation";

import { areasForUser, type Area } from "@/lib/auth/areas";
import { getViewer, type StoreRoles, type Viewer } from "@/lib/auth/session";
import type { StoreRole } from "@/lib/supabase/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who is at the store console, and which store they are looking at.
 *
 * Every tab of the console asks the same three questions: is this
 * somebody who may stand here, which of their stores is `?as=`
 * pointing at, and what does the area switcher need. Answered once
 * here so the tabs cannot drift on authorisation. The store list is
 * read through the user's own session, so Row Level Security decides
 * what comes back and the `as` parameter can never reach a store the
 * account is not in.
 *
 * Two kinds of person stand here. An OWNER (a store account, or an
 * admin) runs everything. An ORGANIZER is a player the owner named:
 * they stay a player everywhere else on the site, and here they get
 * FlareCast and the events for the stores that named them, with the
 * owner-only tabs (singles, settings, organizers) locked on the server
 * as well as hidden.
 */
export interface ConsoleStore {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  status: string;
  join_code: string | null;
  walk_in_enabled: boolean;
  timezone: string;
  kind: "lgs" | "vendor";
  early_board_hours: number;
  tier: "free" | "ultra" | "max";
  /** What the viewer is to THIS store: owner runs it all, staff runs the hub. */
  role: StoreRole;
}

/**
 * Anybody who may stand at the console.
 *
 * An organizer is a player viewer, and the console gives them the same
 * `storeRoles` map an owner's viewer carries (every store at "staff"),
 * so a page can ask `viewer.storeRoles[store.id] === "owner"` of
 * whoever is standing there and get the honest answer.
 */
export type ConsoleViewer =
  | Extract<Viewer, { kind: "store" | "admin" }>
  | (Extract<Viewer, { kind: "player" }> & { storeRoles: StoreRoles });

export interface StoreConsole {
  viewer: ConsoleViewer;
  store: ConsoleStore | null;
  stores: ConsoleStore[];
  areas: Area[];
  currentArea: string | undefined;
}

/**
 * The tabs an organizer never opens. Locked here, in the loader every
 * tab goes through, so hiding a link is never the only thing between
 * an organizer and the billing page.
 */
const OWNER_ONLY_PATHS = ["/store/singles", "/store/settings", "/store/organizers"];

/** The stores this viewer may run from the console, by id. */
export function consoleStoreIds(viewer: Viewer): string[] {
  if (viewer.kind === "admin" || viewer.kind === "store") return viewer.storeIds;
  if (viewer.kind === "player") return viewer.organizerStoreIds;
  return [];
}

/**
 * What the viewer is to one store, or null for a store they cannot run.
 *
 * An admin owns every console they can see. A store account holds the
 * role its membership row says (an owner, or the rare staff login with
 * no player behind it). A player is only ever here as an organizer.
 */
export function consoleRole(viewer: Viewer, storeId: string): StoreRole | null {
  if (viewer.kind === "admin")
    return viewer.storeIds.includes(storeId) ? "owner" : null;
  if (viewer.kind === "store") return viewer.storeRoles[storeId] ?? null;
  if (viewer.kind === "player") {
    return viewer.organizerStoreIds.includes(storeId) ? "staff" : null;
  }
  return null;
}

export async function loadStoreConsole(
  as: string | undefined,
  /** Where sign-in should come back to. */
  path: string,
): Promise<StoreConsole> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect(`/login?next=${encodeURIComponent(path)}`);
  if (viewer.kind === "admin" && viewer.storeIds.length === 0) redirect("/admin");
  if (viewer.kind === "player" && viewer.organizerStoreIds.length === 0) {
    redirect("/profile");
  }
  if (viewer.kind === "unaffiliated") redirect("/store");

  const memberOf = consoleStoreIds(viewer);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "id, name, city, region, status, join_code, walk_in_enabled, timezone, kind, early_board_hours, tier",
    )
    .order("name");

  /*
   * Only the stores this account is a member of, whatever the read
   * returned. Row Level Security lets an admin read EVERY store, so the
   * founder opening /store with no `?as=` used to land on the first
   * store in the alphabet - somebody else's - with the area switcher
   * unable to name it and so showing "Admin console" while stuck on a
   * shop's overview. Memberships come from `getViewer`'s service-role
   * read, the same list the switcher's options are built from.
   */
  const stores = ((data ?? []) as Omit<ConsoleStore, "role">[])
    .filter((row) => memberOf.includes(row.id))
    .map((row) => ({ ...row, role: consoleRole(viewer, row.id) ?? "staff" }));
  const store = stores.find((row) => row.id === as) ?? stores[0] ?? null;
  if (!store && viewer.kind === "admin") redirect("/admin");
  if (!store && viewer.kind === "player") redirect("/profile");

  /* The server-side lock on the owner-only tabs. An organizer who types
     the URL lands on the overview, exactly as if the tab were not there. */
  if (
    store &&
    store.role !== "owner" &&
    OWNER_ONLY_PATHS.some((locked) => path === locked || path.startsWith(`${locked}/`))
  ) {
    redirect(`/store?as=${store.id}`);
  }

  const areas = await areasForUser(viewer.user.id, viewer.kind === "admin");

  const consoleViewer: ConsoleViewer =
    viewer.kind === "player"
      ? {
          ...viewer,
          storeRoles: Object.fromEntries(
            viewer.organizerStoreIds.map((id) => [id, "staff"] as const),
          ),
        }
      : viewer;

  return {
    viewer: consoleViewer,
    store,
    stores,
    areas,
    currentArea: store ? `/store?as=${store.id}` : undefined,
  };
}

/** The tab bar's links, with the store carried along. */
export function consoleHref(path: string, storeId: string): string {
  return `${path}?as=${storeId}`;
}
