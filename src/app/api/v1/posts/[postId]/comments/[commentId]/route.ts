import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { tooMany } from "@/lib/api/throttle";
import { deleteComment } from "@/lib/feed/posts";

export const dynamic = "force-dynamic";

const HOUR = 60 * 60_000;

/**
 * Takes a comment down: for the person who wrote it, or for the person
 * whose post it sits under (App Store guideline 1.2: an owner can clear
 * their own thread). The website's Delete calls the same lib.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { postId, commentId } = await params;
  if (!z.guid().safeParse(postId).success || !z.guid().safeParse(commentId).success) {
    return badRequest("postId and commentId are required");
  }

  const limited = tooMany(`comment-delete:${player.playerId}`, 60, HOUR);
  if (limited) return limited;

  const outcome = await deleteComment(postId, commentId, player.playerId);
  if (outcome.ok) return Response.json({ ok: true });
  const status =
    outcome.reason === "not-found" ? 404 : outcome.reason === "not-allowed" ? 403 : 503;
  return Response.json({ error: outcome.reason }, { status });
}
