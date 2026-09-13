import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { followCounts } from "./follows";

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

  const [wants, counts] = await Promise.all([
    getSupabaseAdmin()
      .from("player_wants")
      .select("id", { count: "exact", head: true })
      .eq("player_id", playerId),
    followCounts(playerId),
  ]);

  if (wants.error) console.error("Could not count Flares", wants.error);

  return { flares: wants.count ?? 0, ...counts };
}
