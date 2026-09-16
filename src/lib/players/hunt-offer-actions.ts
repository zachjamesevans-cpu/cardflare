"use server";

import { revalidatePath } from "next/cache";

import { LIMITS } from "@/lib/api/throttle";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { offerItems } from "@/lib/feed/posts";
import { playerForUser } from "@/lib/players/accounts";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * "I have these", from somebody's hunt on their profile.
 *
 * A hunt's cards were posted as Flares, possibly across several posts,
 * and an offer is a thing made on a post. So this takes the cards by
 * their Flares, finds the post each one rode in on, and makes one
 * offer per post through the same `offerItems` the Feed uses - the
 * author reads them where they always have. A card with no open Flare
 * cannot be offered on, which is why the panel shows it without a box.
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
  items: { flareId: string; quantity: number }[],
  message: string,
): Promise<
  | { ok: true; offered: number; refused: string[] }
  | { ok: false; message: string; refused: string[] }
> {
  const player = await viewerPlayer(await getViewer());
  if (!player) return { ok: false, message: "Sign in first.", refused: [] };
  if (!huntId || items.length === 0) {
    return { ok: false, message: "Pick a card first.", refused: [] };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Could not send the offer.", refused: [] };
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

  const admin = getSupabaseAdmin();
  const [{ data: hunt }, { data: requests }, { data: flares }] = await Promise.all([
    admin.from("hunts").select("id, player_id").eq("id", huntId).maybeSingle(),
    admin.from("hunt_requests").select("id").eq("hunt_id", huntId),
    admin
      .from("flares")
      .select("id, posted_batch, hunt_request_id, status")
      .in(
        "id",
        items.map((item) => item.flareId),
      ),
  ]);
  if (!hunt) return { ok: false, message: "That hunt is gone.", refused: [] };
  if (hunt.player_id === player.id) {
    return { ok: false, message: "That one is yours.", refused: [] };
  }

  /* Only Flares that belong to THIS hunt, and only ones with a post to
     offer on. Anything else in the list is refused by name. */
  const onHunt = new Set((requests ?? []).map((row) => row.id));
  const byPost = new Map<string, { flareId: string; quantity: number }[]>();
  const refused: string[] = [];
  for (const item of items) {
    const flare = (flares ?? []).find((row) => row.id === item.flareId);
    if (
      !flare ||
      flare.status !== "open" ||
      !flare.posted_batch ||
      !flare.hunt_request_id ||
      !onHunt.has(flare.hunt_request_id)
    ) {
      refused.push(item.flareId);
      continue;
    }
    byPost.set(flare.posted_batch, [...(byPost.get(flare.posted_batch) ?? []), item]);
  }
  if (byPost.size === 0) {
    return { ok: false, message: "Those cards were all found already.", refused };
  }

  let offered = 0;
  let failure: string | null = null;
  for (const [postId, group] of byPost) {
    const outcome = await offerItems(
      postId,
      player.id,
      player.displayName,
      group,
      message,
    );
    refused.push(...(outcome.refused ?? []));
    if (outcome.ok) {
      offered += outcome.offered;
      continue;
    }
    failure =
      outcome.reason === "own-flare"
        ? "That one is yours."
        : outcome.reason === "nothing-left"
          ? "Those cards were all found already."
          : outcome.reason === "at-cap"
            ? "You have offers on the most cards this room allows."
            : "Could not send the offer.";
  }

  revalidatePath("/feed");
  revalidatePath(`/hunts/${huntId}`);
  revalidatePath(`/p/${hunt.player_id}`);

  if (offered === 0) {
    return { ok: false, message: failure ?? "Could not send the offer.", refused };
  }
  return { ok: true, offered, refused };
}
