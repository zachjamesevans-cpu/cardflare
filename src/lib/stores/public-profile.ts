import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * A store as a player may see it.
 *
 * The shape is the privacy boundary: no coordinates, no contact email, no
 * provenance beyond the attribution line the licence requires. Everything
 * here is either the shop's own public contact information or something
 * CardFlare decided (verified, tier).
 *
 * A DRAFT LISTING IS NOT VISIBLE. An imported candidate nobody approved
 * returns null and the page 404s, which keeps "nothing is published
 * without admin approval" true at the last hop as well as the first.
 */
export interface PublicStore {
  storeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  verified: boolean;
  ultra: boolean;
  unclaimed: boolean;
  /** The line the source licence requires, when the record came from one. */
  attribution: string | null;
}

export async function publicStore(storeId: string): Promise<PublicStore | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("stores")
    .select(
      "id, name, city, region, address_line, postal_code, phone, website, claim_status, tier, verified_at, listing_state",
    )
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.listing_state !== "published") return null;

  const { data: source } = await admin
    .from("store_sources")
    .select("attribution")
    .eq("store_id", storeId)
    .limit(1);

  const address =
    [data.address_line, data.city, data.region, data.postal_code]
      .filter(Boolean)
      .join(", ") || null;

  return {
    storeId: data.id,
    name: data.name,
    address,
    phone: data.phone,
    website: data.website,
    verified: data.verified_at !== null,
    ultra: data.tier === "ultra",
    unclaimed: data.claim_status === "unclaimed",
    attribution: source?.[0]?.attribution ?? null,
  };
}
