"use server";

import { revalidatePath } from "next/cache";

import { LIMITS } from "@/lib/api/throttle";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { playerForUser } from "@/lib/players/accounts";
import {
  addComment,
  likePost,
  listComments,
  offerFromFeed,
  offerItems,
  unlikePost,
  type PostComment,
} from "./posts";

/**
 * The website's side of a social Flare post.
 *
 * Every action re-derives the player from the session, never from the
 * form: a Server Action is a public POST endpoint. Guests get nothing
 * here - they can read a post in a room, but liking, commenting and
 * offering from the Feed are things an account does.
 */

const MINUTE = 60_000;
/** Hearts an hour, per account. Toggling is cheap; a script is not. */
const LIKE_LIMIT = { limit: 60, windowMs: 60 * MINUTE };
/** Comments an hour, per account. A conversation, not a firehose. */
const COMMENT_LIMIT = { limit: 20, windowMs: 60 * MINUTE };

async function viewerPlayer(
  viewer: Viewer,
): Promise<{ id: string; displayName: string } | null> {
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") {
    return { id: viewer.playerId, displayName: viewer.playerName };
  }
  const player = await playerForUser(viewer.user.id);
  return player ? { id: player.id, displayName: player.display_name } : null;
}

/** A heart on or off. Returns whether the write landed. */
export async function togglePostLikeAction(
  postId: string,
  liked: boolean,
): Promise<boolean> {
  const player = await viewerPlayer(await getViewer());
  if (!player || !postId) return false;

  if (
    !checkRateLimit(`post-like:${player.id}`, LIKE_LIMIT.limit, LIKE_LIMIT.windowMs)
      .allowed
  ) {
    return false;
  }

  const done = liked
    ? await likePost(postId, player.id)
    : await unlikePost(postId, player.id);
  if (done) revalidatePath("/feed");
  return done;
}

/** The thread, opened on demand rather than shipped with every post. */
export async function loadPostThreadAction(postId: string): Promise<PostComment[]> {
  const player = await viewerPlayer(await getViewer());
  if (!player || !postId) return [];
  return listComments(postId);
}

/** One line under the post. Returns the line as the thread will show it. */
export async function addPostCommentAction(
  postId: string,
  body: string,
): Promise<PostComment | null> {
  const player = await viewerPlayer(await getViewer());
  if (!player || !postId) return null;

  if (
    !checkRateLimit(
      `post-comment:${player.id}`,
      COMMENT_LIMIT.limit,
      COMMENT_LIMIT.windowMs,
    ).allowed
  ) {
    return null;
  }

  const comment = await addComment(postId, player.id, player.displayName, body);
  if (comment) revalidatePath("/feed");
  return comment;
}

/**
 * "I have this", from the card's large view in the Feed.
 *
 * A form action so it can sit inside the zoom the same way the room's
 * offer does. The page repaints behind it: the card reads OFFERED, the
 * thread carries the note.
 */
export async function offerFromFeedAction(formData: FormData): Promise<void> {
  const player = await viewerPlayer(await getViewer());
  if (!player) return;

  const postId = text(formData, "postId");
  const flareId = text(formData, "flareId");
  if (!postId || !flareId) return;

  /* The room's own cap on hands raised, per account here since the
     Feed has no room identity to key on until the offer makes one. */
  if (
    !checkRateLimit(
      `offer-feed:${player.id}`,
      LIMITS.offer.limit,
      LIMITS.offer.windowMs,
    ).allowed
  ) {
    return;
  }

  const outcome = await offerFromFeed(
    postId,
    flareId,
    player.id,
    player.displayName,
    text(formData, "note"),
  );
  if (!outcome.ok) console.error(`Feed offer refused: ${outcome.reason}`);

  revalidatePath("/feed");
}

/**
 * "I have these", from a post's full list: several cards, each with how
 * many, in one offer with one optional message. Quantities are capped
 * on the server at what is still wanted; a card answered meanwhile is
 * named in `refused` so the sheet can say so.
 */
export async function offerItemsAction(
  postId: string,
  items: { flareId: string; quantity: number }[],
  message: string,
): Promise<
  | { ok: true; offered: number; refused: string[] }
  | { ok: false; message: string; refused: string[] }
> {
  const player = await viewerPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in first.", refused: [] };
  if (!postId || items.length === 0) {
    return { ok: false, message: "Pick a card first.", refused: [] };
  }

  if (
    !checkRateLimit(
      `offer-feed:${player.id}`,
      LIMITS.offer.limit,
      LIMITS.offer.windowMs,
    ).allowed
  ) {
    return {
      ok: false,
      message: "That is a lot of offers. Give it a minute.",
      refused: [],
    };
  }

  const outcome = await offerItems(
    postId,
    player.id,
    player.displayName,
    items,
    message,
  );
  revalidatePath("/feed");
  if (!outcome.ok) {
    const message =
      outcome.reason === "own-flare"
        ? "That one is yours."
        : outcome.reason === "nothing-left"
          ? "Those cards were all found already."
          : outcome.reason === "at-cap"
            ? "You have offers on the most cards this room allows."
            : "Could not send the offer.";
    return { ok: false, message, refused: outcome.refused ?? [] };
  }
  return { ok: true, offered: outcome.offered, refused: outcome.refused ?? [] };
}
