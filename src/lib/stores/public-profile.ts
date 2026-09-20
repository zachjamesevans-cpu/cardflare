import "server-only";

import type { GameSlug } from "@/lib/players/games-catalog";
import { avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { caseFor } from "@/lib/stores/case";
import type { CasePick } from "@/lib/stores/case-schema";
import { parseHours, type StoreHours } from "@/lib/stores/hours";
import { storeGamesFrom } from "@/lib/stores/page";

/**
 * A store as a player may see it.
 *
 * The shape is the privacy boundary: no coordinates, no contact email, no
 * provenance beyond the attribution line the licence requires. Everything
 * here is either the shop's own public contact information or something
 * cardflare decided (verified, tier).
 *
 * A DRAFT LISTING IS NOT VISIBLE. An imported candidate nobody approved
 * returns null and the page 404s, which keeps "nothing is published
 * without admin approval" true at the last hop as well as the first.
 */
export interface PublicStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  verified: boolean;
  ultra: boolean;
  unclaimed: boolean;
  /**
   * What the store says about itself, or null. Only a claimed store can
   * have written one - the console's page form is behind ownership - so
   * an unclaimed listing stays factual by construction.
   */
  description: string | null;
  /** The line the source licence requires, when the record came from one. */
  attribution: string | null;
  /**
   * The store's own pictures, as `/api/avatars/...` paths the website
   * draws directly; the app's route makes them absolute. Only a
   * claimed store can have uploaded one, so an unclaimed listing has
   * none by construction, the same way it has no description.
   */
  logoUrl: string | null;
  coverUrl: string | null;
  /** Seven days, Sunday first, or null while the shop has not said. */
  hours: StoreHours | null;
  games: GameSlug[];
  /** The zone the hours are read in, so "open now" is the shop's now. */
  timeZone: string;
  /** Up to six cards from the synced singles, chosen by hand. */
  casePicks: CasePick[];
}

export async function publicStore(storeId: string): Promise<PublicStore | null> {
  if (!isSupabaseConfigured()) return null;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("stores")
    .select(
      "id, name, city, region, address_line, postal_code, phone, website, claim_status, tier, verified_at, listing_state, description, logo_image, cover_image, hours, timezone",
    )
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.listing_state !== "published") return null;

  const [{ data: source }, { data: gameRows }] = await Promise.all([
    admin.from("store_sources").select("attribution").eq("store_id", storeId).limit(1),
    admin.from("store_games").select("game").eq("store_id", storeId),
  ]);

  const address =
    [data.address_line, data.city, data.region, data.postal_code]
      .filter(Boolean)
      .join(", ") || null;

  return {
    storeId: data.id,
    name: data.name,
    city: data.city,
    region: data.region,
    address,
    phone: data.phone,
    website: data.website,
    verified: data.verified_at !== null,
    ultra: data.tier === "ultra",
    unclaimed: data.claim_status === "unclaimed",
    description: data.description,
    attribution: source?.[0]?.attribution ?? null,
    logoUrl: avatarSrc(data.logo_image),
    coverUrl: avatarSrc(data.cover_image),
    hours: parseHours(data.hours),
    games: storeGamesFrom(gameRows ?? []),
    timeZone: data.timezone ?? "UTC",
    casePicks: await caseFor(storeId),
  };
}
