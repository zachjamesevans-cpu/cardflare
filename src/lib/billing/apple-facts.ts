import type { SubscriptionStatus } from "./schema";

/**
 * Apple's subscription answers, folded to ours — pure, importable
 * anywhere, tested against fixtures.
 *
 * The server asks the App Store Server API for a subscription's status
 * and gets back JWS strings. Because that answer arrives over TLS from
 * Apple's own host, the signatures are NOT re-verified here — transport
 * trust is the trust, exactly as with Stripe's API responses. The JWS
 * pokes that arrive from the OUTSIDE (the app after a purchase, the
 * server notification webhook) are never believed at all: they only
 * name an original transaction id that the server then asks Apple about.
 */

/** One subscription, as the product needs to know it. */
export interface AppleFacts {
  originalTransactionId: string;
  productId: string;
  /** The UUID the app planted at purchase — our player id, or null for
      a purchase made outside the app (App Store resubscribe). */
  appAccountToken: string | null;
  status: SubscriptionStatus;
  /** Paid-through (or grace-through) instant, ISO. Null = no tail. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * The payload of a JWS, decoded WITHOUT signature verification.
 *
 * Only ever called on strings Apple's API handed us over TLS, or on
 * webhook pokes whose content is treated as a hint and re-fetched.
 */
export function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;

  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Apple's numeric subscription status, folded to ours.
 *
 * 1 active, 2 expired, 3 billing retry, 4 billing grace, 5 revoked.
 * Grace keeps access (Apple is still retrying the card and says to keep
 * serving); plain billing retry does not; revoked (a refund) cuts
 * immediately, which `currentPeriodEnd: null` on a canceled row does.
 */
export function foldAppleStatus(status: number): SubscriptionStatus {
  switch (status) {
    case 1:
      return "active";
    case 3:
    case 4:
      return "past_due";
    default:
      return "canceled";
  }
}

/**
 * One `lastTransactions` entry from Get All Subscription Statuses,
 * reduced to facts. Returns null when the entry is not readable or not
 * the product asked about.
 */
export function appleFactsFrom(
  entry: {
    status?: unknown;
    signedTransactionInfo?: unknown;
    signedRenewalInfo?: unknown;
  },
  expectedProductId: string,
): AppleFacts | null {
  if (typeof entry.status !== "number") return null;
  if (typeof entry.signedTransactionInfo !== "string") return null;

  const transaction = decodeJwsPayload(entry.signedTransactionInfo);
  if (!transaction) return null;

  const productId = str(transaction.productId);
  const originalTransactionId = str(transaction.originalTransactionId);
  if (!productId || !originalTransactionId) return null;
  if (productId !== expectedProductId) return null;

  const renewal =
    typeof entry.signedRenewalInfo === "string"
      ? decodeJwsPayload(entry.signedRenewalInfo)
      : null;

  const status = foldAppleStatus(entry.status);

  /* Grace period extends the paid-through moment past expiresDate —
     Apple says keep serving while the card retries. Revocation removes
     the tail entirely: a refund is not a period somebody paid for. */
  const expiresMs =
    entry.status === 4
      ? (num(renewal?.gracePeriodExpiresDate) ?? num(transaction.expiresDate))
      : num(transaction.expiresDate);

  return {
    originalTransactionId,
    productId,
    appAccountToken: str(transaction.appAccountToken) ?? null,
    status,
    currentPeriodEnd:
      entry.status === 5 || expiresMs === null
        ? null
        : new Date(expiresMs).toISOString(),
    cancelAtPeriodEnd: renewal ? num(renewal.autoRenewStatus) === 0 : false,
  };
}

/**
 * The whole Get All Subscription Statuses response, reduced to the one
 * subscription that matters: the entry for our product.
 */
export function parseStatusResponse(
  body: unknown,
  expectedProductId: string,
): AppleFacts | null {
  if (typeof body !== "object" || body === null) return null;

  const groups = (body as { data?: unknown }).data;
  if (!Array.isArray(groups)) return null;

  for (const group of groups) {
    const last = (group as { lastTransactions?: unknown }).lastTransactions;
    if (!Array.isArray(last)) continue;

    for (const entry of last) {
      const facts = appleFactsFrom(entry as Record<string, unknown>, expectedProductId);
      if (facts) return facts;
    }
  }

  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
