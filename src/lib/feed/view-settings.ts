import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { feedViewFrom, type FeedView } from "./views";

/**
 * Reading and writing a player's Feed view.
 *
 * Kept apart from `views.ts` because that file is bundled by the app
 * and this one holds the admin client. Same split as everywhere else:
 * the vocabulary is shared, the database is not.
 */

/** A player's chosen view, or the original for anyone who has not chosen. */
export async function feedViewFor(playerId: string): Promise<FeedView> {
  if (!isSupabaseConfigured()) return "classic";

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("feed_view")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    /* Say so rather than silently reverting somebody's choice: a read
       that fails looks exactly like a player who never picked. */
    console.error("Could not read the Feed view", error);
    return "classic";
  }

  return feedViewFrom(data?.feed_view);
}

/**
 * Set it. The value is narrowed by `feedViewFrom` before it is written,
 * so a caller cannot store a view nothing can draw - the column's check
 * constraint says the same thing, and neither is the only guard.
 */
export async function setFeedView(
  playerId: string,
  view: string,
): Promise<{ ok: boolean }> {
  if (!isSupabaseConfigured()) return { ok: false };

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ feed_view: feedViewFrom(view) })
    .eq("id", playerId);

  if (error) {
    console.error("Could not set the Feed view", error);
    return { ok: false };
  }

  return { ok: true };
}
