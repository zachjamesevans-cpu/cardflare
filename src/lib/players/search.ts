import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { avatarWearFor } from "./equips";
import { avatarSrc } from "./profile-image";

/**
 * Finding a player by name - the founder's ask: "I can search up
 * someone by username and see their profile and follow them."
 *
 * Deliberately shallow: name, picture and what the picture wears,
 * nothing else. The profile page is where the rest lives, and the
 * follow button lives there too. Only signed-in viewers reach this
 * (the route enforces it), so it is a directory for people already
 * inside, not for the open web.
 */

export interface FoundPlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

export async function searchPlayersByName(query: string): Promise<FoundPlayer[]> {
  const trimmed = query.trim();
  if (!isSupabaseConfigured() || trimmed.length < 2) return [];

  /* Escape the LIKE wildcards so "100%" searches for a percent sign. */
  const like = `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("id, display_name, avatar_url, equipped_avatar_frame")
    .ilike("display_name", like)
    .order("display_name")
    .limit(12);

  if (error) {
    console.error("Could not search players", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const wear = await avatarWearFor(rows.map((row) => row.id));

  return rows.map((row) => ({
    playerId: row.id,
    displayName: row.display_name,
    avatarUrl: avatarSrc(row.avatar_url),
    frame: row.equipped_avatar_frame,
    ring: wear.get(row.id)?.ring ?? null,
    aura: wear.get(row.id)?.aura ?? null,
  }));
}
