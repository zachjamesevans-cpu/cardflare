import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { followCounts } from "./follows";
import { countOfferings } from "./wants";

/**
 * The three numbers on a profile: Flares, followers, following.
 *
 * The founder: "followers, following, flares instead of post count".
 * Flares counts the cards on the player's Want List, which is what a
 * Flare is once it leaves the room.
 */
export interface ProfileStats {
  flares: number;
  followers: number;
  following: number;
}

export async function profileStats(playerId: string): Promise<ProfileStats> {
  if (!isSupabaseConfigured()) return { flares: 0, followers: 0, following: 0 };

  /* Wants plus offerings: exactly what the profile's Flares grid draws,
     so the number over the grid and the grid agree. The second audit
     read 9 over a grid of 13, because this counted wants alone. */
  const [wants, offerings, counts] = await Promise.all([
    getSupabaseAdmin()
      .from("player_wants")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId),
    countOfferings(playerId),
    followCounts(playerId),
  ]);

  if (wants.error) console.error("Could not count Flares", wants.error);

  return { flares: (wants.count ?? 0) + offerings, ...counts };
}
