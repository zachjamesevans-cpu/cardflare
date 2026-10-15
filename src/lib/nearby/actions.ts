"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { binderSessionFor } from "@/lib/lists/haves";
import { removeFromBinder } from "@/lib/lists/repository";
import { LIMITS } from "@/lib/api/throttle";
import { checkRateLimit } from "@/lib/rate-limit";
import { playerForUser } from "@/lib/players/accounts";

import { setNearbyMatching } from "./settings";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";
import { z } from "zod";

import { answerNearby, stopTrading } from "./answer";
import { WANTED_PATH } from "./shared";

/**
 * Nearby matching's Server Actions. Each re-establishes the player
 * from the session, because a Server Action is a public POST endpoint.
 */

const SIGN_IN = "Sign in first.";
const GENERIC = "Something went wrong. Please try again in a moment.";

async function viewerPlayer(): Promise<{ id: string; name: string } | null> {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") return null;
  if (viewer.kind === "player") return { id: viewer.playerId, name: viewer.playerName };
  const player = await playerForUser(viewer.user.id);
  return player ? { id: player.id, name: player.display_name } : null;
}

function touched() {
  revalidatePath("/flare");
  revalidatePath("/feed");
  revalidatePath("/profile/settings");
}

export async function setNearbyMatchingAction(
  on: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const player = await viewerPlayer();
  if (!player) return { ok: false, message: SIGN_IN };

  const saved = await setNearbyMatching(player.id, on);
  if (!saved) return { ok: false, message: GENERIC };
  touched();
  return { ok: true };
}

export async function removeHaveAction(formData: FormData): Promise<void> {
  const player = await viewerPlayer();
  if (!player) return;

  const session = await binderSessionFor(player.id, player.name, false);
  const entryId = String(formData.get("entryId") ?? "");
  if (!session || !entryId) return;

  await removeFromBinder(entryId, session.id);
  touched();
}

const askSchema = z.object({
  kind: z.enum(["want", "flare"]),
  id: z.string().uuid(),
});

/**
 * A reply from "Wanted near you": the holder's draft, sent now. Nothing
 * went out when they tapped the message icon; this is the Send.
 */
export async function answerNearbyAction(
  ask: { kind: "want" | "flare"; id: string },
  body: string,
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  const player = await viewerPlayer();
  if (!player) return { ok: false, message: SIGN_IN };
  const parsedAsk = askSchema.safeParse(ask);
  const text = body.trim();
  if (!parsedAsk.success) return { ok: false, message: GENERIC };
  if (!text) return { ok: false, message: "Write something first." };
  if (text.length > MESSAGE_MAX_LENGTH)
    return { ok: false, message: "That is too long." };

  /* Charged only when a conversation is actually started (see
     OpenThreadOptions); a second reply lands in the first. */
  const mayCreate = () =>
    checkRateLimit(
      `thread-open:${player.id}`,
      LIMITS.threadOpen.limit,
      LIMITS.threadOpen.windowMs,
    ).allowed;

  const outcome = await answerNearby(player.id, parsedAsk.data, text, { mayCreate });
  if (outcome.ok) touched();
  return outcome;
}

/** "Not trading this anymore", from a card's section on "Wanted near you". */
export async function stopTradingAction(
  haveEntryId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const player = await viewerPlayer();
  if (!player) return { ok: false, message: SIGN_IN };
  if (!z.string().uuid().safeParse(haveEntryId).success) {
    return { ok: false, message: GENERIC };
  }
  const saved = await stopTrading(player.id, player.name, haveEntryId);
  if (!saved) return { ok: false, message: GENERIC };
  touched();
  revalidatePath(WANTED_PATH);
  return { ok: true };
}
