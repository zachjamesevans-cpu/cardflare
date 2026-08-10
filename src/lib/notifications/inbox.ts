import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The player's inbox, for the website.
 *
 * The backbone has recorded these since Milestone 13 and the app has
 * read them since Milestone 14 — but only over `/api/v1`, so a player
 * on a laptop had no way to see the offer that arrived while they were
 * away. Same rows, same order, same fifty-item window; this is the
 * server-side twin of the route the app calls.
 */

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  /** Where it happened. A room path, ready to link. */
  url: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function listInbox(playerId: string): Promise<InboxItem[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not read the inbox", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/** How many are still unread — the number the tab bar wears. */
export async function unreadCount(playerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const { count, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .is("read_at", null);

  if (error) {
    console.error("Could not count unread notifications", error);
    return 0;
  }

  return count ?? 0;
}

/** Marks the whole inbox read. Scoped to the caller's own rows. */
export async function markInboxRead(playerId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .is("read_at", null);

  if (error) console.error("Could not mark the inbox read", error);
}
