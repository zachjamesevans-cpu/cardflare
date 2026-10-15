import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The post that started each hunt: its first, by when it went up.
 *
 * The Feed says what a hunt post did. The founder, on the composer's
 * hunt picker: "if they want to add to their hunt, they go to their
 * hunts screen, and once they update it, in the feed it'll say 'so
 * and so updated their hunt' or 'so and so added a new hunt'." So the
 * first post in a hunt reads "started a hunt", and every later one
 * "added 3 cards to" it.
 */
export async function huntStartPosts(huntIds: string[]): Promise<Map<string, string>> {
  const starts = new Map<string, string>();
  if (huntIds.length === 0) return starts;

  const { data, error } = await getSupabaseAdmin()
    .from("flare_posts")
    .select("id, hunt_id, published_at")
    .in("hunt_id", huntIds)
    .order("published_at", { ascending: true });
  if (error) {
    /* Unknown reads as "added to": never claims a start it cannot see. */
    console.error("Could not read when the hunts started", error);
    return starts;
  }

  for (const row of data ?? []) {
    if (row.hunt_id && !starts.has(row.hunt_id)) starts.set(row.hunt_id, row.id);
  }
  return starts;
}
