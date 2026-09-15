import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The social facts about a Flare post, read in bulk for the Feed.
 *
 * Deliberately the bottom of the stack: nothing here knows what a feed
 * item is, so the Feed's repository can call this and `posts.ts` can
 * call the repository without the two chasing each other in a circle.
 *
 * A post is a posting action: every Flare's `posted_batch`, and a Flare
 * posted alone is a post of one (the migration backfilled its own id).
 */

export interface PostSocial {
  likes: number;
  comments: number;
  /** The viewer's own heart. */
  liked: boolean;
}

/** Hearts and comment counts for a set of posts, one query each. */
export async function socialForPosts(
  postIds: string[],
  viewerId: string,
): Promise<Map<string, PostSocial>> {
  const out = new Map<string, PostSocial>();
  const ids = [...new Set(postIds)];
  if (ids.length === 0 || !isSupabaseConfigured()) return out;

  const admin = getSupabaseAdmin();
  const [likes, comments] = await Promise.all([
    admin.from("flare_post_likes").select("post_id, player_id").in("post_id", ids),
    admin.from("flare_post_comments").select("post_id").in("post_id", ids),
  ]);

  if (likes.error || comments.error) {
    console.error("Could not read the posts' likes", likes.error ?? comments.error);
    return out;
  }

  for (const id of ids) out.set(id, { likes: 0, comments: 0, liked: false });

  for (const row of likes.data ?? []) {
    const social = out.get(row.post_id);
    if (!social) continue;
    social.likes += 1;
    if (row.player_id === viewerId) social.liked = true;
  }
  for (const row of comments.data ?? []) {
    const social = out.get(row.post_id);
    if (social) social.comments += 1;
  }

  return out;
}

/**
 * Whether a card has been answered, and whether by the viewer.
 *
 * OFFERED needs no new column: "somebody raised a hand on this Flare"
 * is what `flare_responses` has always held, so an offer made in the
 * room and one made from the Feed mark the card the same way.
 */
export interface CardAnswer {
  offered: boolean;
  youOffered: boolean;
}

export async function answersFor(
  flareIds: string[],
  viewerSessionIds: Set<string>,
): Promise<Map<string, CardAnswer>> {
  const out = new Map<string, CardAnswer>();
  const ids = [...new Set(flareIds)];
  if (ids.length === 0 || !isSupabaseConfigured()) return out;

  const { data, error } = await getSupabaseAdmin()
    .from("flare_responses")
    .select("flare_id, responder_session_id")
    .in("flare_id", ids);

  if (error) {
    console.error("Could not read the posts' offers", error);
    return out;
  }

  for (const row of data ?? []) {
    const answer = out.get(row.flare_id) ?? { offered: false, youOffered: false };
    answer.offered = true;
    if (viewerSessionIds.has(row.responder_session_id)) answer.youOffered = true;
    out.set(row.flare_id, answer);
  }

  return out;
}

/**
 * The cards in these posts that already traded.
 *
 * FOUND is the Flare's own `traded` status. The room's list only reads
 * open Flares, so without this a hunt for six cards would quietly
 * become a hunt for five the moment one was crossed off, and the
 * founder's ask is the opposite: the card stays, marked.
 */
export interface FoundFlare {
  id: string;
  cardId: string;
  postId: string;
}

export async function foundInPosts(postIds: string[]): Promise<FoundFlare[]> {
  const ids = [...new Set(postIds)];
  if (ids.length === 0 || !isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("flares")
    .select("id, card_id, posted_batch")
    .in("posted_batch", ids)
    .eq("status", "traded");

  if (error) {
    console.error("Could not read the posts' traded cards", error);
    return [];
  }

  return (data ?? []).flatMap((row) =>
    row.posted_batch
      ? [{ id: row.id, cardId: row.card_id, postId: row.posted_batch }]
      : [],
  );
}
