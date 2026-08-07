import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Push-token registration — the reason the app exists.
 *
 * One row per device token. Registering an already-known token moves it
 * to the caller's player (a reinstall, a shared device changing hands):
 * the token is unique, so upserting on it can never leave two players
 * holding the same phone. Unregistering only deletes the caller's own
 * rows — one player cannot silence another's device.
 */

const registerSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  pushToken: z.string().min(1).max(4096),
});

const REGISTER_MAX = 20;
const REGISTER_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const rate = checkRateLimit(
    `api-device:${player.playerId}`,
    REGISTER_MAX,
    REGISTER_WINDOW_MS,
  );
  if (!rate.allowed) {
    return Response.json({ error: "rate-limited" }, { status: 429 });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("platform and pushToken are required");

  const { error } = await getSupabaseAdmin().from("player_devices").upsert(
    {
      player_id: player.playerId,
      platform: parsed.data.platform,
      push_token: parsed.data.pushToken,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "push_token" },
  );

  if (error) {
    console.error("Could not register the device", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  return Response.json({ ok: true });
}

const unregisterSchema = z.object({ pushToken: z.string().min(1).max(4096) });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = unregisterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("pushToken is required");

  const { error } = await getSupabaseAdmin()
    .from("player_devices")
    .delete()
    .eq("push_token", parsed.data.pushToken)
    .eq("player_id", player.playerId);

  if (error) {
    console.error("Could not unregister the device", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  return Response.json({ ok: true });
}
