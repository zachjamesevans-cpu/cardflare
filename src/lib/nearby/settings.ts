import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { afterHolderChanged } from "./matching";

/**
 * The one switch: Nearby matching on or off, both directions at once.
 *
 * Off means your Flares are not matched against anybody's cards AND
 * your marked cards are offered to nobody. One toggle rather than two
 * because the founder asked for "a simple Nearby Matching toggle", and
 * a player who wants out wants out of both.
 */
export interface NearbySettings {
  enabled: boolean;
  /** The ZIP the matching anchors on; null means nothing can match yet. */
  postalCode: string | null;
}

export async function nearbySettingsFor(playerId: string): Promise<NearbySettings> {
  if (!isSupabaseConfigured()) return { enabled: false, postalCode: null };

  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("nearby_matching, postal_code")
    .eq("id", playerId)
    .maybeSingle();

  return {
    enabled: data?.nearby_matching ?? false,
    postalCode: data?.postal_code ?? null,
  };
}

export async function setNearbyMatching(
  playerId: string,
  on: boolean,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ nearby_matching: on })
    .eq("id", playerId);

  if (error) {
    console.error("Could not set nearby matching", error);
    return false;
  }

  /* Switching on is the moment to look: everything already marked on
     the list may have a wanter waiting. */
  if (on) void afterHolderChanged(playerId);

  return true;
}
