"use server";

import { revalidatePath } from "next/cache";

import { LIMITS } from "@/lib/api/throttle";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { offerOnHunt, type HuntOfferLine, type HuntOfferOutcome } from "./hunt-offers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * "I have these", from somebody's hunt on their profile: the website's
 * door to `offerOnHunt`. Cards are picked by request, so every open
 * card on the hunt can be answered, posted or not.
 */

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

export async function offerOnHuntAction(
  huntId: string,
  lines: HuntOfferLine[],
  message: string,
): Promise<HuntOfferOutcome> {
  const player = await viewerPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in first.", refused: [] };
  if (!huntId || lines.length === 0) {
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

  const outcome = await offerOnHunt(huntId, player, lines, message);

  revalidatePath("/feed");
  revalidatePath("/local");
  revalidatePath(`/hunts/${huntId}`);

  return outcome;
}
