import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { GAME_SLUGS, type GameSlug } from "./games-catalog";

/**
 * Which games a player plays - the sign-up question's storage.
 *
 * Replace-not-merge on purpose: the picker always shows the full set
 * with the current answers ticked, so what arrives IS the player's
 * whole answer, and merging would make games impossible to untick.
 */

export async function setPlayerGames(
  playerId: string,
  games: GameSlug[],
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const admin = getSupabaseAdmin();
  const chosen = [...new Set(games)].filter((game) => GAME_SLUGS.includes(game));

  const { error: clearError } = await admin
    .from("player_games")
    .delete()
    .eq("player_id", playerId);

  if (clearError) {
    console.error("Could not clear the player's games", clearError);
    return false;
  }

  if (chosen.length === 0) return true;

  const { error } = await admin
    .from("player_games")
    .insert(chosen.map((game) => ({ player_id: playerId, game })));

  if (error) {
    console.error("Could not save the player's games", error);
    return false;
  }

  return true;
}

export async function listPlayerGames(playerId: string): Promise<GameSlug[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("player_games")
    .select("game")
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not read the player's games", error);
    return [];
  }

  return (data ?? []).map((row) => row.game as GameSlug);
}
