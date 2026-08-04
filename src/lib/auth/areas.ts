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
 * admin, and one option per store the account is genuinely a member of —
 * the founder gets a store view by inviting themselves and claiming it,
 * exactly like any store owner would, never by impersonation. The header
 * shows a switcher only when there is more than one entry.
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
    return areas;
  }

  const storeIds = (memberships ?? []).map((row) => row.store_id);
  if (storeIds.length === 0) return areas;

  const { data: stores, error: storesError } = await admin
    .from("stores")
    .select("id, name, kind")
    .in("id", storeIds)
    .order("name");

  if (storesError) {
    console.error("Could not read stores for the area switcher", storesError);
    return areas;
  }

  for (const store of stores ?? []) {
    areas.push({
      label: `${store.kind === "vendor" ? "Vendor" : "Store"} · ${store.name}`,
      href: `/store?as=${store.id}`,
    });
  }

  return areas;
}
