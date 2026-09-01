import { decodeJwsPayload } from "@/lib/billing/apple-facts";
import { lookUpAppleSubscription } from "@/lib/billing/apple";
import {
  playerForAppleTransaction,
  syncPlayerTierFromSubscription,
  upsertAppleSubscriptionForPlayer,
} from "@/lib/billing/repository";

export const dynamic = "force-dynamic";

/**
 * App Store Server Notifications V2.
 *
 * Renewals, cancellations, refunds, billing recoveries — Apple sends a
 * signed payload for each. It is treated purely as a POKE: the payload
 * is decoded (never signature-verified) only far enough to learn WHICH
 * original transaction id changed, and everything believed about it is
 * then re-fetched from Apple's API over TLS. A forged notification can
 * therefore cause nothing but a lookup of the truth.
 *
 * Only ids this product already knows are acted on at all, and the
 * response is 200 regardless — Apple retries non-200s, and there is
 * nothing a retry of a bad payload would fix.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { signedPayload?: unknown };
    if (typeof body.signedPayload !== "string") return ok();

    const payload = decodeJwsPayload(body.signedPayload);
    const data =
      payload && typeof payload.data === "object" && payload.data !== null
        ? (payload.data as Record<string, unknown>)
        : null;
    if (!data || typeof data.signedTransactionInfo !== "string") return ok();

    const transaction = decodeJwsPayload(data.signedTransactionInfo);
    const originalTransactionId =
      transaction && typeof transaction.originalTransactionId === "string"
        ? transaction.originalTransactionId
        : null;
    if (!originalTransactionId) return ok();

    /* Only subscriptions somebody has synced from the app are ours to
       update; a notification about an unknown id has no owner yet and
       the app's own sync will claim it when they open cardflare. */
    const playerId = await playerForAppleTransaction(originalTransactionId);
    if (!playerId) return ok();

    const lookup = await lookUpAppleSubscription(originalTransactionId);
    if (lookup.outcome !== "found") return ok();

    await upsertAppleSubscriptionForPlayer(playerId, lookup.facts);
    await syncPlayerTierFromSubscription(playerId);

    return ok();
  } catch (caught) {
    console.error("Apple webhook fell over", caught);
    return ok();
  }
}

function ok(): Response {
  return Response.json({ ok: true });
}
