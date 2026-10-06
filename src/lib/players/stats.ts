import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { followCounts } from "./follows";
import { countOfferings, doneWantKeys, wantKey } from "./wants";

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
  const [wants, offerings, counts, done] = await Promise.all([
    getSupabaseAdmin()
      .from("player_wants")
      .select("card_id, printing_id")
      .eq("player_id", playerId),
    countOfferings(playerId),
    followCounts(playerId),
    doneWantKeys(playerId),
  ]);

  if (wants.error) console.error("Could not count Flares", wants.error);

  /* Less what is already found, which the grid leaves off too: a card
     ticked off in a hunt is not something they are still looking for. */
  const open = (wants.data ?? []).filter(
    (row) => !done.has(wantKey(row.card_id, row.printing_id)),
  ).length;

  return { flares: open + offerings, ...counts };
}
