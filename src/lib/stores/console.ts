import "server-only";

import { redirect } from "next/navigation";

import { areasForUser, type Area } from "@/lib/auth/areas";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who is at the store console, and which store they are looking at.
 *
 * Every tab of the console asks the same three questions: is this a
 * store account, which of its stores is `?as=` pointing at, and what
 * does the area switcher need. Answered once here so the tabs cannot
 * drift on authorisation. The store list is read through the user's
 * own session, so Row Level Security decides what comes back and the
 * `as` parameter can never reach a store the account is not in.
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
}

export interface StoreConsole {
  viewer: Extract<Viewer, { kind: "store" | "admin" }>;
  store: ConsoleStore | null;
  stores: ConsoleStore[];
  areas: Area[];
  currentArea: string | undefined;
}

export async function loadStoreConsole(
  as: string | undefined,
  /** Where sign-in should come back to. */
  path: string,
): Promise<StoreConsole> {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect(`/login?next=${encodeURIComponent(path)}`);
  if (viewer.kind === "admin" && viewer.storeIds.length === 0) redirect("/admin");
  if (viewer.kind === "player") redirect("/profile");
  if (viewer.kind === "unaffiliated") redirect("/store");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("stores")
    .select(
      "id, name, city, region, status, join_code, walk_in_enabled, timezone, kind, early_board_hours, tier",
    )
    .order("name");

  const stores = (data ?? []) as ConsoleStore[];
  const store = stores.find((row) => row.id === as) ?? stores[0] ?? null;
  const areas = await areasForUser(viewer.user.id, viewer.kind === "admin");

  return {
    viewer,
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
