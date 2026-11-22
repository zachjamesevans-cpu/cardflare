import "server-only";

import { withdrawFlares } from "@/lib/flares/withdraw";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Taking down one reported thing, from the admin's report queue.
 *
 * The Terms promise objectionable content comes down within 24 hours,
 * and until now the only tools were deleting the whole account or
 * editing the database by hand. These remove exactly the post or the
 * comment, and close every open report about it in the same step, so
 * three people reporting one comment leave nothing behind in the queue.
 *
 * A post comes down the way its owner takes it down (`withdrawFlares`):
 * its Flares are withdrawn, so it leaves the Feed, profiles and search
 * exactly as an owner's own takedown does, with nothing special-cased.
 * A comment is deleted outright; the report keeps its words in
 * `target_excerpt`, so the record of what was said survives it.
 *
 * Callers are admin-only server actions (moderation-actions.ts, behind
 * `requireAdmin`). Nothing here checks who is asking.
 */

export type RemoveOutcome =
  { ok: true; closed: number } | { ok: false; reason: "not-found" | "unavailable" };

/** Closes every open report on one target, as resolved by this admin. */
async function closeReportsOn(
  kind: "post" | "comment",
  targetId: string,
  resolvedBy: string,
): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_reports")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
    })
    .eq("status", "open")
    .eq("target_kind", kind)
    .eq("target_id", targetId)
    .select("id");
  if (error) {
    console.error("Could not close the reports on the removed item", error);
    return 0;
  }
  return data?.length ?? 0;
}

/** Takes a reported post down, as its owner would, and closes its reports. */
export async function removePostAsAdmin(
  postId: string,
  adminUserId: string,
): Promise<RemoveOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const { data: post, error } = await getSupabaseAdmin()
    .from("flare_posts")
    .select("id, player_id")
    .eq("id", postId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the reported post", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!post?.player_id) return { ok: false, reason: "not-found" };

  const withdrawn = await withdrawFlares(post.player_id, { postId });
  if (!withdrawn.ok) return { ok: false, reason: "unavailable" };

  return { ok: true, closed: await closeReportsOn("post", postId, adminUserId) };
}

/** Deletes a reported comment and closes its reports. */
export async function removeCommentAsAdmin(
  commentId: string,
  adminUserId: string,
): Promise<RemoveOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const { data, error } = await getSupabaseAdmin()
    .from("flare_post_comments")
    .delete()
    .eq("id", commentId)
    .select("id");
  if (error) {
    console.error("Could not delete the reported comment", error);
    return { ok: false, reason: "unavailable" };
  }
  /* Already gone (its author deleted it): the reports still close. */
  const closed = await closeReportsOn("comment", commentId, adminUserId);
  if (!data?.length && closed === 0) return { ok: false, reason: "not-found" };
  return { ok: true, closed };
}
