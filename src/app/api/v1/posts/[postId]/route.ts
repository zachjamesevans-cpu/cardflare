import { z } from "zod";

import { absoluteAvatars } from "@/lib/api/absolute-avatars";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import {
  addComment,
  likePost,
  offerFromFeed,
  offerItems,
  POST_COMMENT_MAX,
  postDetail,
  unlikePost,
} from "@/lib/feed/posts";

export const dynamic = "force-dynamic";

/**
 * A Flare post, for the app: the whole thing in one GET, and every
 * social action in one POST. The same lib calls the website's Feed
 * and its actions make, so the two clients cannot disagree about who
 * liked what or which card is OFFERED.
 *
 * Accounts only, both ways: a post is read from the Feed, and the Feed
 * is a signed-in screen.
 */

const MINUTE = 60_000;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like") }),
  z.object({ action: z.literal("unlike") }),
  z.object({
    action: z.literal("comment"),
    body: z
      .string()
      .min(1)
      .max(POST_COMMENT_MAX * 2),
  }),
  z.object({
    action: z.literal("offer"),
    flareId: z.guid(),
    note: z
      .string()
      .max(POST_COMMENT_MAX * 2)
      .optional(),
  }),
  /* "I have these": several cards, each with how many, in one offer. */
  z.object({
    action: z.literal("offer-items"),
    items: z
      .array(z.object({ flareId: z.guid(), quantity: z.number().int().min(1).max(99) }))
      .min(1)
      .max(60),
    message: z
      .string()
      .max(POST_COMMENT_MAX * 2)
      .optional(),
  }),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { postId } = await params;
  if (!z.guid().safeParse(postId).success) return badRequest("postId is required");

  const post = await postDetail(postId, player.playerId);
  if (!post) return Response.json({ error: "not-found" }, { status: 404 });

  /* Faces and art made absolute for the phone, same as the Feed. */
  return Response.json({ post: absoluteAvatars(post) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { postId } = await params;
  if (!z.guid().safeParse(postId).success) return badRequest("postId is required");

  const parsed = actionSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised post action");
  const body = parsed.data;

  if (body.action === "like" || body.action === "unlike") {
    const limited = tooMany(`post-like:${player.playerId}`, 60, 60 * MINUTE);
    if (limited) return limited;

    const done =
      body.action === "like"
        ? await likePost(postId, player.playerId)
        : await unlikePost(postId, player.playerId);
    return done
      ? Response.json({ ok: true })
      : Response.json({ error: "unavailable" }, { status: 503 });
  }

  if (body.action === "comment") {
    const limited = tooMany(`post-comment:${player.playerId}`, 20, 60 * MINUTE);
    if (limited) return limited;

    const comment = await addComment(
      postId,
      player.playerId,
      player.displayName,
      body.body,
    );
    return comment
      ? Response.json({ ok: true, comment: absoluteAvatars(comment) })
      : Response.json({ error: "unavailable" }, { status: 503 });
  }

  if (body.action === "offer-items") {
    const limited = tooMany(
      `offer-feed:${player.playerId}`,
      LIMITS.offer.limit,
      LIMITS.offer.windowMs,
    );
    if (limited) return limited;

    const outcome = await offerItems(
      postId,
      player.playerId,
      player.displayName,
      body.items,
      body.message ?? "",
    );
    return outcome.ok
      ? Response.json({
          ok: true,
          offered: outcome.offered,
          refused: outcome.refused ?? [],
        })
      : Response.json(
          { error: outcome.reason, refused: outcome.refused ?? [] },
          { status: 409 },
        );
  }

  /* The room's own cap on hands raised, per account: the Feed has no
     room identity to key on until the offer makes one. */
  const limited = tooMany(
    `offer-feed:${player.playerId}`,
    LIMITS.offer.limit,
    LIMITS.offer.windowMs,
  );
  if (limited) return limited;

  const outcome = await offerFromFeed(
    postId,
    body.flareId,
    player.playerId,
    player.displayName,
    body.note ?? "",
  );
  return outcome.ok
    ? Response.json({ ok: true })
    : Response.json({ error: outcome.reason }, { status: 409 });
}
