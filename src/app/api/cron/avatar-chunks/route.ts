import { sweepStaleAvatarChunks } from "@/lib/players/avatar-chunks";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Clears picture uploads the app started and never finished: pieces
 * under tmp/ older than an hour. See `sweepStaleAvatarChunks`.
 *
 * Guarded by CRON_SECRET, fail-closed, like the other crons.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  const result = await sweepStaleAvatarChunks();
  return Response.json({ ok: !result.failed, ...result });
}
