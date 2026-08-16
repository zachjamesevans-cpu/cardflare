import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { avatarSrc } from "./profile-image";
import { avatarWearFor } from "./equips";
import type { CosmeticArtFile } from "./art-files";

/**
 * Follows: the founder's option C.
 *
 * One-way, no approval step, and when two players follow each other the
 * product calls them Trade partners. Counts exist as rows and are shown
 * NOWHERE: whether follower counts ever go public is an open product
 * decision, and this module deliberately exports no count function, so
 * a surface cannot show one without a change here first.
 */

export interface FollowState {
  /** The viewer follows this player. */
  following: boolean;
  /** This player follows the viewer. */
  followsYou: boolean;
  /** Both true: what the product calls Trade partners. */
  partners: boolean;
}

const NOBODY: FollowState = { following: false, followsYou: false, partners: false };

/** Follow. Idempotent; self-follows are refused by the schema. */
export async function followPlayer(
  followerId: string,
  followedId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || followerId === followedId) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_follows")
    .upsert(
      { follower_id: followerId, followed_id: followedId },
      { onConflict: "follower_id,followed_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("Could not follow", error);
    return false;
  }
  return true;
}

export async function unfollowPlayer(
  followerId: string,
  followedId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await getSupabaseAdmin()
    .from("player_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followed_id", followedId);

  if (error) {
    console.error("Could not unfollow", error);
    return false;
  }
  return true;
}

/** Both directions in one read, so a popup costs one query. */
export async function followState(
  viewerId: string,
  targetId: string,
): Promise<FollowState> {
  if (!isSupabaseConfigured() || viewerId === targetId) return NOBODY;

  const { data, error } = await getSupabaseAdmin()
    .from("player_follows")
    .select("follower_id, followed_id")
    .or(
      `and(follower_id.eq.${viewerId},followed_id.eq.${targetId}),` +
        `and(follower_id.eq.${targetId},followed_id.eq.${viewerId})`,
    );

  if (error) {
    console.error("Could not read the follow state", error);
    return NOBODY;
  }

  const following = (data ?? []).some((row) => row.follower_id === viewerId);
  const followsYou = (data ?? []).some((row) => row.follower_id === targetId);
  return { following, followsYou, partners: following && followsYou };
}

export interface FollowedPlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  /** The catalogue ring, worn over the frame when both are set. */
  ring: string | null;
  /** The avatar effect floating around the picture. */
  aura: string | null;
  /** The dropped-in files behind those two, when they are Rive ones. */
  ringArt: CosmeticArtFile | null;
  auraArt: CosmeticArtFile | null;
  /** They follow back: Trade partners. */
  partners: boolean;
}

/** Who this player follows, for their own People list. Newest first. */
export async function listFollowing(playerId: string): Promise<FollowedPlayer[]> {
  if (!isSupabaseConfigured()) return [];

  const admin = getSupabaseAdmin();

  const { data: edges, error } = await admin
    .from("player_follows")
    .select("followed_id, created_at")
    .eq("follower_id", playerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !edges || edges.length === 0) {
    if (error) console.error("Could not list follows", error);
    return [];
  }

  const ids = edges.map((edge) => edge.followed_id);

  const [{ data: rows }, { data: backEdges }, wear] = await Promise.all([
    admin
      .from("players")
      .select("id, display_name, avatar_url, equipped_avatar_frame")
      .in("id", ids),
    admin
      .from("player_follows")
      .select("follower_id")
      .eq("followed_id", playerId)
      .in("follower_id", ids),
    avatarWearFor(ids),
  ]);

  const back = new Set((backEdges ?? []).map((edge) => edge.follower_id));
  const byId = new Map((rows ?? []).map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        playerId: row.id,
        displayName: row.display_name,
        avatarUrl: avatarSrc(row.avatar_url),
        frame: row.equipped_avatar_frame,
        ring: wear.get(row.id)?.ring ?? null,
        aura: wear.get(row.id)?.aura ?? null,
        ringArt: wear.get(row.id)?.ringArt ?? null,
        auraArt: wear.get(row.id)?.auraArt ?? null,
        partners: back.has(row.id),
      },
    ];
  });
}
