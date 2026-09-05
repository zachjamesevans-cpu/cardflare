import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { avatarWearFor } from "./equips";
import { avatarPathFor, avatarSrc } from "./profile-image";

/**
 * A value inside a PostgREST `.or()` filter, quoted.
 *
 * The filter is a string the query builder assembles, and commas,
 * parentheses and dots are its grammar. Left bare, a query like
 * `zq,and(postal_code.like.941*)` would close the pattern early and
 * become its own arm of the OR, a way to read columns this search
 * never returns. PostgREST's rule: wrap the value in double quotes and
 * escape the quote and the backslash inside it. Then a comma is just a
 * comma, and a name with brackets in it finds itself.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

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
  /** The unique one. Two results may share a name; never a handle. */
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

export async function searchPlayersByName(query: string): Promise<FoundPlayer[]> {
  const trimmed = query.trim();
  if (!isSupabaseConfigured() || trimmed.length < 2) return [];

  /* Escape the LIKE wildcards so "100%" searches for a percent sign. */
  const escaped = trimmed.replace(/[\\%_]/g, "\\$&");
  const like = quoteFilterValue(`%${escaped}%`);

  /*
   * Either half of an identity finds somebody, because a person at a
   * counter will type whichever one they were told. A leading "@" is
   * dropped rather than searched for: it is how a handle is written, not
   * part of the handle itself.
   */
  const byHandle = quoteFilterValue(`%${escaped.replace(/^@/, "").toLowerCase()}%`);

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select(
      "id, display_name, handle, avatar_url, avatar_animated, tier, equipped_avatar_frame",
    )
    .or(`display_name.ilike.${like},handle.ilike.${byHandle}`)
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
    handle: row.handle,
    avatarUrl: avatarSrc(avatarPathFor(row)),
    frame: row.equipped_avatar_frame,
    ring: wear.get(row.id)?.ring ?? null,
    aura: wear.get(row.id)?.aura ?? null,
  }));
}
