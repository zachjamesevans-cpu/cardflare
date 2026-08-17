import { z } from "zod";

import { badRequest } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { openSignup } from "@/lib/auth/signup";
import { starterNameFromEmail } from "@/lib/auth/signup-schema";
import { handleSeedFrom } from "@/lib/players/handle";

export const dynamic = "force-dynamic";

/**
 * Sign-in for the app, through CardFlare's own front door.
 *
 * The app used to call Supabase's token endpoint directly, and that was
 * the ONE request in the whole app still carrying a JSON body — written
 * before the field discovery that on some networks (the founder's, for
 * one) every request with a body dies in transit while bodyless ones
 * sail through. Every other write already rides in the `x-cf-payload`
 * header to this server for exactly that reason; sign-in could not,
 * because Supabase does not read our header. So the grant moves here:
 * the phone sends a bodyless request with the header, and THIS server
 * makes the bodied call to Supabase — server-to-server traffic does not
 * cross the network that eats bodies.
 *
 * Only the anon key is used upstream, the same key the app itself
 * shipped with: this route grants nothing a client could not already
 * ask Supabase for. Rate-limited anyway, because a login endpoint on
 * our own domain should not be a free credential-stuffing amplifier.
 *
 * Failures are non-oracle on purpose, same as the website's login: one
 * answer for wrong email and wrong password alike.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sign-in"),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("sign-up"),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(8).max(200),
    /* Optional so an app build that predates one-page sign-up still
       works; the server derives both from the address in that case. */
    displayName: z.string().trim().max(40).optional(),
    handle: z.string().trim().max(20).optional(),
  }),
  z.object({
    action: z.literal("refresh"),
    refreshToken: z.string().min(1).max(2000),
  }),
]);

const SIGN_IN_MAX = 10;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/* Creating accounts is rarer than signing in, and each one writes rows.
   Tighter on purpose; a launch-night store full of new players is still
   nowhere near five per phone per hour. */
const SIGN_UP_MAX = 5;
const SIGN_UP_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "unavailable" }, { status: 503 });

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised auth action");

  const body = parsed.data;

  /*
   * Sign-up runs first and then FALLS THROUGH to the password grant:
   * the app makes one call and comes back signed in, which is one
   * fewer round over networks that have eaten this app's requests
   * before. The TestFlight link is the invitation - the founder's
   * call - so no invite is checked.
   */
  if (body.action === "sign-up") {
    const rate = checkRateLimit(
      `app-sign-up:${await clientKey()}`,
      SIGN_UP_MAX,
      SIGN_UP_WINDOW_MS,
    );
    if (!rate.allowed) {
      return Response.json({ error: "rate-limited" }, { status: 429 });
    }

    const name = body.displayName?.trim() || starterNameFromEmail(body.email);
    const outcome = await openSignup(body.email, body.password, {
      displayName: name,
      handle: body.handle?.trim().toLowerCase() || handleSeedFrom(name),
    });
    if (!outcome.ok) {
      return outcome.reason === "already-registered"
        ? Response.json({ error: "already-registered" }, { status: 409 })
        : Response.json({ error: "signup-failed" }, { status: 500 });
    }
  }

  if (body.action === "sign-in") {
    const rate = checkRateLimit(
      `app-sign-in:${await clientKey()}`,
      SIGN_IN_MAX,
      SIGN_IN_WINDOW_MS,
    );
    if (!rate.allowed) {
      return Response.json({ error: "rate-limited" }, { status: 429 });
    }
  }

  const grant =
    body.action === "refresh"
      ? {
          type: "refresh_token",
          payload: { refresh_token: body.refreshToken },
        }
      : {
          type: "password",
          payload: { email: body.email, password: body.password },
        };

  try {
    const upstream = await fetch(`${url}/auth/v1/token?grant_type=${grant.type}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey },
      body: JSON.stringify(grant.payload),
      signal: AbortSignal.timeout(10_000),
    });

    const result = (await upstream.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!upstream.ok || !result.access_token) {
      return Response.json({ error: "invalid-credentials" }, { status: 401 });
    }

    return Response.json({
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? "",
    });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
