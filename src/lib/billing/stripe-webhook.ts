import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook signature verification, by hand and by the book.
 *
 * Stripe signs `${timestamp}.${rawBody}` with the endpoint's webhook
 * secret (HMAC-SHA256) and sends the result in the Stripe-Signature
 * header as `t=<unix>,v1=<hex>[,v1=<hex>...]`. Verifying it ourselves
 * keeps the dependency count at zero — the same reason the email and
 * card providers are plain fetch — and makes the check a pure function
 * a unit test can feed known vectors.
 *
 * Two teeth, both mandatory: the comparison is constant-time (a
 * character-by-character === leaks how much of a guess matched), and
 * the timestamp must be recent (an old captured request must not replay
 * forever). Stripe's own default tolerance is five minutes; same here.
 */

export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Pulls timestamp and candidate signatures out of the header, or null. */
export function parseStripeSignature(
  header: string | null,
): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) {
    return null;
  }

  return { timestamp, signatures };
}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now: number = Date.now(),
): boolean {
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;

  if (Math.abs(now - parsed.timestamp * 1000) > SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${payload}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return parsed.signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });
}
