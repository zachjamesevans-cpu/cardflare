import "server-only";

import { createSign } from "node:crypto";

import { parseStatusResponse, type AppleFacts } from "./apple-facts";

/**
 * The App Store Server API, spoken directly.
 *
 * Trust design, in one paragraph: nothing a device or a webhook sends
 * is ever believed. The app finishing a purchase and Apple's server
 * notifications are both treated as POKES that name an original
 * transaction id; entitlement comes only from asking Apple's API over
 * TLS what that subscription's status is right now. That removes the
 * whole certificate-chain-verification problem — the same way Stripe's
 * API responses are trusted because of the pipe they came down.
 *
 * Configuration is four environment variables, all from App Store
 * Connect → Users and Access → Integrations → In-App Purchase:
 *
 *   APP_STORE_ISSUER_ID    — the issuer UUID above the key list
 *   APP_STORE_KEY_ID       — the key's ID
 *   APP_STORE_PRIVATE_KEY  — the .p8 file's contents (BEGIN PRIVATE KEY…)
 *   APPLE_PRO_PRODUCT_ID   — optional; defaults below
 *
 * Unconfigured, every lookup reports so instead of guessing.
 */

const PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
const SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";

/** The subscription product, as created in App Store Connect. */
export const APPLE_PRO_PRODUCT_ID =
  process.env.APPLE_PRO_PRODUCT_ID ?? "gg.cardflare.app.pro.monthly";

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "gg.cardflare.app";

export type AppleLookup =
  | { outcome: "found"; facts: AppleFacts }
  | { outcome: "not-found" }
  | { outcome: "not-configured" }
  | { outcome: "error" };

function config(): { issuerId: string; keyId: string; privateKey: string } | null {
  const issuerId = process.env.APP_STORE_ISSUER_ID;
  const keyId = process.env.APP_STORE_KEY_ID;
  const privateKey = process.env.APP_STORE_PRIVATE_KEY;

  if (!issuerId || !keyId || !privateKey) return null;
  /* The .p8 often arrives with literal \n in an env var. */
  return { issuerId, keyId, privateKey: privateKey.replace(/\\n/g, "\n") };
}

export function isAppleConfigured(): boolean {
  return config() !== null;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * The API's bearer token: an ES256 JWT signed with the In-App Purchase
 * key. Twenty minutes is Apple's ceiling; five is plenty for one call.
 */
function apiToken(creds: {
  issuerId: string;
  keyId: string;
  privateKey: string;
}): string {
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: creds.keyId, typ: "JWT" }),
  );
  const payload = base64url(
    JSON.stringify({
      iss: creds.issuerId,
      iat: now,
      exp: now + 300,
      aud: "appstoreconnect-v1",
      bid: BUNDLE_ID,
    }),
  );

  /* ieee-p1363 is the raw r||s form JOSE wants — no DER conversion. */
  const signature = createSign("sha256")
    .update(`${header}.${payload}`)
    .sign({ key: creds.privateKey, dsaEncoding: "ieee-p1363" });

  return `${header}.${payload}.${base64url(signature)}`;
}

/**
 * What is this subscription's status, per Apple, right now?
 *
 * Production first; a transaction the production environment has never
 * heard of retries against sandbox, which is how TestFlight and sandbox
 * testers work without a switch anywhere.
 */
export async function lookUpAppleSubscription(
  originalTransactionId: string,
): Promise<AppleLookup> {
  const creds = config();
  if (!creds) return { outcome: "not-configured" };

  /* The id goes in the path; forbid anything that could break out. */
  if (!/^[0-9A-Za-z_.-]{1,64}$/.test(originalTransactionId)) {
    return { outcome: "not-found" };
  }

  for (const host of [PRODUCTION_HOST, SANDBOX_HOST]) {
    try {
      const response = await fetch(
        `${host}/inApps/v1/subscriptions/${originalTransactionId}`,
        {
          headers: { authorization: `Bearer ${apiToken(creds)}` },
          cache: "no-store",
        },
      );

      if (response.status === 404) continue; // unknown here; try sandbox
      if (response.status === 401) {
        console.error("App Store Server API refused our key");
        return { outcome: "error" };
      }
      if (!response.ok) {
        console.error("App Store Server API error", response.status);
        return { outcome: "error" };
      }

      const facts = parseStatusResponse(await response.json(), APPLE_PRO_PRODUCT_ID);
      return facts ? { outcome: "found", facts } : { outcome: "not-found" };
    } catch (caught) {
      console.error("Could not reach the App Store Server API", caught);
      return { outcome: "error" };
    }
  }

  return { outcome: "not-found" };
}
