"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { attachSessionToPlayer } from "@/lib/admin/orphan-sessions";
import type { AttachState } from "@/lib/admin/orphan-schema";

/**
 * The console's "this is them" button.
 *
 * Behind `requireAdmin` like every other action here: attaching a guest
 * session hands somebody else's Flares, binder and room history to an
 * account, which is the most consequential thing this console can do to
 * a player's data.
 */

export async function attachSessionAction(
  _previous: AttachState,
  form: FormData,
): Promise<AttachState> {
  await requireAdmin();

  const sessionId = String(form.get("sessionId") ?? "").trim();
  const playerId = String(form.get("playerId") ?? "").trim();

  if (!sessionId || !playerId) {
    return { status: "error", message: "Pick a session and an account." };
  }

  const outcome = await attachSessionToPlayer(sessionId, playerId);

  if (outcome.status === "failed") {
    return { status: "error", message: outcome.reason };
  }

  revalidatePath("/admin/players");

  return {
    status: "done",
    message:
      outcome.status === "merged"
        ? "Folded into the account's existing room identity."
        : "Claimed by the account.",
  };
}
