"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { ownProfile } from "@/lib/players/profile";
import { deleteLoggedTrade, logTrade } from "./logged";
import { logTradeSchema, type LogTradeInput } from "./logged-schema";

/**
 * The website's side of a logged trade. The player is re-derived from
 * the session, never from the form, and the schema is applied here
 * because a Server Action is a public POST endpoint.
 */

export type LogTradeResult = { ok: true } | { ok: false; message: string };

async function viewer(): Promise<{
  id: string;
  displayName: string;
  tier: string | null;
} | null> {
  const current = await getViewer();
  if (current.kind === "anonymous") return null;
  const playerId =
    current.kind === "player"
      ? current.playerId
      : ((await playerForUser(current.user.id))?.id ?? null);
  if (!playerId) return null;
  const profile = await ownProfile(playerId);
  if (!profile) return null;
  return { id: playerId, displayName: profile.displayName, tier: profile.tier };
}

function repaint() {
  revalidatePath("/profile");
  revalidatePath("/profile/trades");
}

export async function logTradeAction(input: LogTradeInput): Promise<LogTradeResult> {
  const player = await viewer();
  if (!player) return { ok: false, message: "Sign in first." };

  const parsed = logTradeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the trade and try again.",
    };
  }

  const result = await logTrade(
    player.id,
    player.displayName,
    player.tier,
    parsed.data,
  );
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "locked"
          ? "Logging trades is part of Pro."
          : result.reason === "no-card"
            ? "Pick a card from the list."
            : result.reason === "yourself"
              ? "You cannot trade with yourself."
              : "Could not log the trade. Try again.",
    };
  }

  repaint();
  return { ok: true };
}

export async function deleteLoggedTradeAction(id: string): Promise<LogTradeResult> {
  const player = await viewer();
  if (!player) return { ok: false, message: "Sign in first." };

  const removed = await deleteLoggedTrade(player.id, id);
  if (!removed) return { ok: false, message: "Could not remove that trade." };

  repaint();
  return { ok: true };
}
