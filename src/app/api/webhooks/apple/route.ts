import { decodeJwsPayload } from "@/lib/billing/apple-facts";
import { lookUpAppleSubscription, sandboxMayEntitle } from "@/lib/billing/apple";
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
 * Only ids this product already knows are acted on at all. A payload we
 * cannot read is answered 200: Apple retries non-2xx, and there is
 * nothing a retry of a bad payload would fix. But when the payload was
 * fine and OUR side failed — Apple's API unreachable, our key refused,
 * the write lost — the answer is 503, because Apple's retry is the only
 * thing that will ever bring this notification back. Swallowing it
 * meant a refund or an expiry could be missed for good and the player
 * kept Pro.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { signedPayload?: unknown };
  try {
    body = (await request.json()) as { signedPayload?: unknown };
  } catch {
    return ok();
  }

  try {
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
    if (lookup.outcome === "error" || lookup.outcome === "not-configured") {
      return retryLater();
    }
    if (lookup.outcome !== "found") return ok();

    /* Same rule as the app's own sync: a free sandbox purchase does not
       make a production player Pro. See sandboxMayEntitle. */
    if (lookup.environment === "sandbox" && !sandboxMayEntitle(playerId)) {
      return ok();
    }

    const written = await upsertAppleSubscriptionForPlayer(playerId, lookup.facts);
    if (written === "unavailable") return retryLater();
    await syncPlayerTierFromSubscription(playerId);

    return ok();
  } catch (caught) {
    /* The payload parsed; whatever threw was ours. Ask for the retry. */
    console.error("Apple webhook fell over", caught);
    return retryLater();
  }
}

function ok(): Response {
  return Response.json({ ok: true });
}

function retryLater(): Response {
  return Response.json({ ok: false }, { status: 503 });
}
