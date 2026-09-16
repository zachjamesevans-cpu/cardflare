"use server";

import { revalidatePath } from "next/cache";

import { LIMITS } from "@/lib/api/throttle";
import { getViewer } from "@/lib/auth/session";
import { notifyEarlyBoardFlares, notifyRoomFlare } from "@/lib/notifications/notify";
import { roomPhase } from "@/lib/events/schema";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { getPlayerSession } from "@/lib/players/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { publishPost, type PublishItem } from "./publish";

/**
 * The website's composer, publishing: one post of one or many cards.
 *
 * Posts to the room the session is in when it is in one and the board
 * is taking Flares; to the area otherwise. The same library the app's
 * /api/v1/flares/publish calls.
 */
export async function publishPostAction(input: {
  intent: "want" | "showcase";
  caption: string | null;
  items: PublishItem[];
  hunt: { id: string } | { name: string } | null;
  acceptsTrade: boolean;
  acceptsCash: boolean;
  /** Post to the current room when in one. Off posts to the area. */
  toRoom: boolean;
}): Promise<
  | { ok: true; postId: string; posted: number; huntId: string | null; atCap: boolean }
  | { ok: false; message: string }
> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return { ok: false, message: "Sign in first." };
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) return { ok: false, message: "Sign in first." };

  if (
    !checkRateLimit(
      `area-flare:${playerId}`,
      LIMITS.areaFlare.limit,
      LIMITS.areaFlare.windowMs,
    ).allowed
  ) {
    return { ok: false, message: "That is a lot of Flares. Give it a minute." };
  }

  let eventId: string | null = null;
  let session: { id: string; displayName: string } | null = null;
  let early = false;
  if (input.toRoom) {
    const room = await getPlayerSession();
    const current = room ? await currentRoomForSession(room.id) : null;
    if (room && current) {
      const phase = roomPhase(current.event, Date.now());
      if (phase === "live" || phase === "early") {
        eventId = current.event.id;
        session = { id: room.id, displayName: room.display_name ?? "A player" };
        early = phase === "early";
      }
    }
  }

  const result = await publishPost({
    playerId,
    session,
    eventId,
    intent: input.intent,
    caption: input.caption,
    items: input.items,
    hunt: input.hunt,
    acceptsTrade: input.acceptsTrade,
    acceptsCash: input.acceptsCash,
    at: null,
  });

  if (!result.ok) {
    if (result.reason === "hunt-limit") {
      return {
        ok: false,
        message: `You are keeping ${result.kept} hunts, which is the limit on your plan. Add these cards to one you already have, or finish one first.`,
      };
    }
    if (result.reason === "already-posted")
      return { ok: false, message: "Those cards are already up." };
    if (result.reason === "empty") return { ok: false, message: "Pick a card first." };
    if (result.reason === "hunt-name")
      return { ok: false, message: "Give the hunt a name." };
    return { ok: false, message: "Could not post that. Try again in a moment." };
  }

  if (eventId && session) {
    if (early && input.intent === "want") void notifyEarlyBoardFlares(eventId);
    void notifyRoomFlare(
      eventId,
      session.id,
      session.displayName,
      input.items.map((item) => item.cardId),
      input.intent,
    );
  }

  revalidatePath("/feed");
  revalidatePath("/flare");
  revalidatePath("/profile");
  return {
    ok: true,
    postId: result.postId,
    posted: result.posted,
    huntId: result.huntId,
    atCap: result.atCap,
  };
}
