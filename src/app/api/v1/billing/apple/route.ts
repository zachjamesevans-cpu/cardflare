import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { isAppleConfigured, lookUpAppleSubscription } from "@/lib/billing/apple";
import {
  playerForAppleTransaction,
  syncPlayerTierFromSubscription,
  upsertAppleSubscriptionForPlayer,
} from "@/lib/billing/repository";
import { tierAllows } from "@/lib/tiers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The app, after a purchase or a restore: "this transaction is mine —
 * what am I entitled to?"
 *
 * The transaction id is a CLAIM, not a proof. Proof is fetched from
 * Apple's API, and the claim is honoured only when the transaction's
 * appAccountToken (the player id the app planted at purchase) matches
 * the caller — or, for a purchase made outside the app where no token
 * exists, when nobody else has claimed the id. A second account
 * replaying somebody's transaction id gets "claimed", not Pro.
 */

const schema = z.object({
  originalTransactionId: z.string().trim().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised purchase");

  if (!isAppleConfigured()) {
    return Response.json({ error: "not-configured" }, { status: 503 });
  }

  const lookup = await lookUpAppleSubscription(parsed.data.originalTransactionId);
  if (lookup.outcome === "not-configured") {
    return Response.json({ error: "not-configured" }, { status: 503 });
  }
  if (lookup.outcome === "error") {
    return Response.json({ error: "apple-unreachable" }, { status: 502 });
  }
  if (lookup.outcome === "not-found") {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const { facts } = lookup;

  if (facts.appAccountToken && facts.appAccountToken !== player.playerId) {
    return Response.json({ error: "claimed" }, { status: 403 });
  }
  if (!facts.appAccountToken) {
    const holder = await playerForAppleTransaction(facts.originalTransactionId);
    if (holder && holder !== player.playerId) {
      return Response.json({ error: "claimed" }, { status: 403 });
    }
  }

  const written = await upsertAppleSubscriptionForPlayer(player.playerId, facts);
  if (written === "claimed") {
    return Response.json({ error: "claimed" }, { status: 403 });
  }
  if (written === "unavailable") {
    return Response.json({ error: "failed" }, { status: 500 });
  }

  await syncPlayerTierFromSubscription(player.playerId);

  return Response.json({ ok: true, pro: await isProNow(player.playerId) });
}

async function isProNow(playerId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("tier")
    .eq("id", playerId)
    .maybeSingle();

  return tierAllows(data?.tier ?? null, "cosmetics");
}
