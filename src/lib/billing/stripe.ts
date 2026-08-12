import "server-only";

import { isTier, type Tier } from "./schema";

/**
 * The Stripe client: plain fetch against their REST API, no SDK.
 *
 * The same shape as every provider in this codebase (Resend, the card
 * catalogue): a base URL, a bearer key from the server environment, and
 * typed wrappers around the two or three calls the product actually
 * makes. Everything here fails closed — no key configured means no
 * Stripe, reported honestly to the caller, never a half-configured
 * request on the wire.
 *
 * The secret key is server-only by construction (this module imports
 * "server-only", so a client bundle pulling it in is a build error),
 * and no price is written in code: each tier maps to a Stripe price ID
 * in an environment variable, so pricing is a dashboard decision.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** The env var that names each tier's Stripe price. */
const PRICE_ENV: Record<Tier, string> = {
  pro: "STRIPE_PRICE_PRO",
  ultra: "STRIPE_PRICE_ULTRA",
  max: "STRIPE_PRICE_MAX",
};

export function stripePriceId(tier: Tier): string | null {
  return process.env[PRICE_ENV[tier]] || null;
}

/** A tier is sellable once its price exists in the environment. */
export function sellableTiers(): Tier[] {
  if (!isStripeConfigured()) return [];
  return (["pro", "ultra", "max"] as Tier[]).filter((tier) =>
    Boolean(stripePriceId(tier)),
  );
}

/**
 * Flattens nested params to Stripe's form encoding:
 * { line_items: [{ price: "p" }] } becomes "line_items[0][price]=p".
 */
export function toStripeForm(
  params: Record<string, unknown>,
  prefix = "",
  out: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          toStripeForm(item as Record<string, unknown>, `${name}[${index}]`, out);
        } else {
          out.append(`${name}[${index}]`, String(item));
        }
      });
    } else if (typeof value === "object") {
      toStripeForm(value as Record<string, unknown>, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

type StripeResult<T> =
  { ok: true; data: T } | { ok: false; reason: "not-configured" | "stripe-error" };

async function stripeRequest<T>(
  path: string,
  params: Record<string, unknown>,
): Promise<StripeResult<T>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, reason: "not-configured" };

  try {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: toStripeForm(params).toString(),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json()) as T & { error?: { message?: string } };

    if (!response.ok) {
      console.error(
        "Stripe refused the request",
        data.error?.message ?? response.status,
      );
      return { ok: false, reason: "stripe-error" };
    }

    return { ok: true, data };
  } catch (caught) {
    console.error("Could not reach Stripe", caught);
    return { ok: false, reason: "stripe-error" };
  }
}

/**
 * A Checkout Session for one tier, owned by one player or store.
 *
 * The owner rides in metadata twice — on the session (for the
 * checkout.session.completed event) and on the subscription itself (so
 * every later lifecycle event still knows whose row to touch). Stripe
 * hosts the payment page; the product never sees a card number.
 */
export async function createCheckoutSession(entry: {
  tier: Tier;
  /** Exactly one of these, matching the tier's audience. */
  playerId?: string;
  storeId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeResult<{ id: string; url: string }>> {
  if (!isTier(entry.tier)) return { ok: false, reason: "stripe-error" };

  const price = stripePriceId(entry.tier);
  if (!price) return { ok: false, reason: "not-configured" };

  const metadata = {
    tier: entry.tier,
    ...(entry.playerId ? { player_id: entry.playerId } : {}),
    ...(entry.storeId ? { store_id: entry.storeId } : {}),
  };

  return stripeRequest("/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: entry.successUrl,
    cancel_url: entry.cancelUrl,
    ...(entry.customerEmail ? { customer_email: entry.customerEmail } : {}),
    metadata,
    subscription_data: { metadata },
  });
}

/** Stripe's hosted "manage my subscription" page for one customer. */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<StripeResult<{ url: string }>> {
  return stripeRequest("/billing_portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
}
