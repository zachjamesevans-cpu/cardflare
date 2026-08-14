import { z } from "zod";

import { badRequest } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";

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
    action: z.literal("refresh"),
    refreshToken: z.string().min(1).max(2000),
  }),
]);

const SIGN_IN_MAX = 10;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "unavailable" }, { status: 503 });

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised auth action");

  const body = parsed.data;

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
    body.action === "sign-in"
      ? {
          type: "password",
          payload: { email: body.email, password: body.password },
        }
      : {
          type: "refresh_token",
          payload: { refresh_token: body.refreshToken },
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
