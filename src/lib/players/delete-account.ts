import "server-only";

import { deletePlayer } from "@/lib/admin/deletion";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * A player deleting their own account.
 *
 * The same act the admin console performs, with one more lock on it:
 * the handle has to be typed back exactly. Everything a foreign key
 * reaches goes with the row (Flares, wants, showcase, threads, devices,
 * cosmetics owned and worn), and the sign-in is removed last so a
 * failure half way leaves a fresh-account state rather than a profile
 * nobody can reach. See `deletePlayer` for why the order matters.
 */
export type DeleteAccountOutcome =
  | { ok: true }
  | { ok: false; reason: "handle-mismatch" | "unavailable"; message: string };

export async function deleteAccount(
  playerId: string,
  confirmHandle: string,
): Promise<DeleteAccountOutcome> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: "unavailable",
      message: "cardflare is not connected to its database.",
    };
  }

  const { data: player } = await getSupabaseAdmin()
    .from("players")
    .select("handle")
    .eq("id", playerId)
    .maybeSingle();

  const typed = confirmHandle.trim().replace(/^@/, "").toLowerCase();
  if (!player || typed !== player.handle.toLowerCase()) {
    return {
      ok: false,
      reason: "handle-mismatch",
      message: "That is not your handle.",
    };
  }

  const outcome = await deletePlayer(playerId);
  if (!outcome.ok) {
    console.error(`Could not delete account ${playerId}: ${outcome.error}`);
    return {
      ok: false,
      reason: "unavailable",
      message: "The account could not be deleted. Try again in a moment.",
    };
  }

  return { ok: true };
}
