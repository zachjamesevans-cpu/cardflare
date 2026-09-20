"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { binderSessionFor } from "@/lib/lists/haves";
import { removeFromBinder } from "@/lib/lists/repository";
import { openWantThread, openFlareThread } from "@/lib/local/threads";
import { LIMITS } from "@/lib/api/throttle";
import { checkRateLimit } from "@/lib/rate-limit";
import { playerForUser } from "@/lib/players/accounts";

import { setNearbyMatching } from "./settings";
import { haveThisMessage, messageOpener } from "./shared";

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

/**
 * "I have this": opens the conversation with the first message already
 * sent, naming the store to meet at when there is one to name.
 */
export async function haveThisAction(
  ask: { kind: "want" | "flare"; id: string },
  storeName: string | null,
  /** "message" opens with a hello instead of the "I have this" line. */
  mode: "have" | "message" = "have",
): Promise<{ ok: true; threadId: string } | { ok: false; message: string }> {
  const player = await viewerPlayer();
  if (!player) return { ok: false, message: SIGN_IN };
  if (
    !checkRateLimit(
      `thread-open:${player.id}`,
      LIMITS.threadOpen.limit,
      LIMITS.threadOpen.windowMs,
    ).allowed
  ) {
    return {
      ok: false,
      message: "That is a lot of conversations at once. Give it a minute.",
    };
  }

  const body = mode === "message" ? messageOpener() : haveThisMessage(storeName);
  const outcome =
    ask.kind === "want"
      ? await openWantThread(ask.id, player.id, body)
      : await openFlareThread(ask.id, player.id, body);

  if (outcome.ok) {
    touched();
    return outcome;
  }
  return {
    ok: false,
    message:
      outcome.reason === "closed"
        ? "This conversation was ended."
        : outcome.reason === "yourself"
          ? "That one is yours."
          : GENERIC,
  };
}
