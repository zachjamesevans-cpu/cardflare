import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Finding a shop by name or town, from the search on the Feed.
 *
 * Published listings only, the same rule the directory and the nearby
 * list keep: a draft is an imported candidate nobody approved. Shops
 * and vendors both, because a player at a show types the booth's name
 * the same way they type a store's.
 */

export interface FoundStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  verified: boolean;
}

const LIMIT = 8;

/** PostgREST reads a quoted filter value verbatim, commas and dots included. */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

export async function searchStores(query: string): Promise<FoundStore[]> {
  const trimmed = query.trim();
  if (!isSupabaseConfigured() || trimmed.length < 2) return [];

  const escaped = trimmed.replace(/[\\%_]/g, "\\$&");
  const like = quoteFilterValue(`%${escaped}%`);

  const { data, error } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, city, region, verified_at")
    .eq("listing_state", "published")
    .or(`name.ilike.${like},city.ilike.${like}`)
    .order("name")
    .limit(LIMIT);

  if (error) {
    console.error("Could not search stores", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    storeId: row.id,
    name: row.name,
    city: row.city,
    region: row.region,
    verified: row.verified_at !== null,
  }));
}
