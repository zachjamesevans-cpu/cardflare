import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/** One console this account can stand in. */
export interface Area {
  label: string;
  href: string;
}

/**
 * Every console the signed-in account can switch to.
 *
 * Strictly what the account already is: the admin option only for an
 * admin, one option per store the account is genuinely a member of, and a
 * player option only when the account holds a player row — the founder
 * gets each view by inviting themselves and claiming it, exactly like any
 * real operator or player would, never by impersonation. The header shows
 * a switcher only when there is more than one entry.
 */
export async function areasForUser(userId: string, isAdmin: boolean): Promise<Area[]> {
  const areas: Area[] = isAdmin ? [{ label: "Admin console", href: "/admin" }] : [];

  if (!isSupabaseConfigured()) return areas;

  const admin = getSupabaseAdmin();

  const { data: memberships, error: memberError } = await admin
    .from("store_members")
    .select("store_id")
    .eq("user_id", userId);

  if (memberError) {
    console.error("Could not read memberships for the area switcher", memberError);
  }

  const storeIds = (memberships ?? []).map((row) => row.store_id);

  if (storeIds.length > 0) {
    const { data: stores, error: storesError } = await admin
      .from("stores")
      .select("id, name, kind")
      .in("id", storeIds)
      .order("name");

    if (storesError) {
      console.error("Could not read stores for the area switcher", storesError);
    }

    for (const store of stores ?? []) {
      areas.push({
        label: `${store.kind === "vendor" ? "Vendor" : "Store"} · ${store.name}`,
        href: `/store?as=${store.id}`,
      });
    }
  }

  const { data: player, error: playerError } = await admin
    .from("players")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (playerError) {
    console.error("Could not read the player row for the area switcher", playerError);
  }

  if (player) {
    areas.push({ label: `Player · ${player.display_name}`, href: "/profile" });
  }

  return areas;
}
