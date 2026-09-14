import "server-only";

import { avatarWearFor } from "@/lib/players/equips";
import type { CosmeticArtFile } from "@/lib/players/art-files";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The player's inbox, for the website AND the app.
 *
 * The backbone has recorded these since Milestone 13 and the app has
 * read them since Milestone 14 — but only over `/api/v1`, so a player
 * on a laptop had no way to see the offer that arrived while they were
 * away. Same rows, same order, same fifty-item window; the app's route
 * now calls this too, so the two inboxes cannot drift on what a row is.
 */

/**
 * The person behind a notice, dressed the way they are everywhere else.
 *
 * The founder, with Instagram's notifications beside ours: each row
 * there leads with the person's picture. This is that picture — the
 * same fields `FollowedPlayer` and a room roster carry, so the face
 * on a notice is the face on the profile, worn ring and all.
 */
export interface InboxActor {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
  ringArt: CosmeticArtFile | null;
  auraArt: CosmeticArtFile | null;
}

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  /** Where it happened. A room path, ready to link. */
  url: string | null;
  createdAt: string;
  readAt: string | null;
  /**
   * Who did it, or null: for a board opening, for a guest with no
   * profile to lead with, and for a player who has since left. A row
   * without one leads with the kind's icon instead of a face.
   */
  actor: InboxActor | null;
}

export async function listInbox(playerId: string): Promise<InboxItem[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at, actor_id")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not read the inbox", error);
    return [];
  }

  const rows = data ?? [];
  const actors = await actorsFor(rows.map((row) => row.actor_id));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    url: row.url,
    createdAt: row.created_at,
    readAt: row.read_at,
    actor: row.actor_id ? (actors.get(row.actor_id) ?? null) : null,
  }));
}

/**
 * The players behind a page of notices, one read for all of them.
 *
 * Fifty rows from a busy room are mostly the same handful of people,
 * so the ids are deduplicated before anything is fetched. Same query
 * and same dressing as a People list, so one person looks the same
 * on both screens.
 */
async function actorsFor(ids: (string | null)[]): Promise<Map<string, InboxActor>> {
  const actors = new Map<string, InboxActor>();
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return actors;

  const [{ data, error }, wear] = await Promise.all([
    getSupabaseAdmin()
      .from("players")
      .select(
        "id, display_name, avatar_url, avatar_animated, tier, equipped_avatar_frame",
      )
      .in("id", wanted),
    avatarWearFor(wanted),
  ]);

  if (error) {
    /* A notice without a face is still a notice: fall back to the icon
       rather than hide the inbox behind one failed read. */
    console.error("Could not read the people behind the inbox", error);
    return actors;
  }

  for (const row of data ?? []) {
    actors.set(row.id, {
      playerId: row.id,
      displayName: row.display_name,
      avatarUrl: avatarSrc(avatarPathFor(row)),
      frame: row.equipped_avatar_frame,
      ring: wear.get(row.id)?.ring ?? null,
      aura: wear.get(row.id)?.aura ?? null,
      ringArt: wear.get(row.id)?.ringArt ?? null,
      auraArt: wear.get(row.id)?.auraArt ?? null,
    });
  }

  return actors;
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
