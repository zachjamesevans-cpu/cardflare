import { sweepPageScans } from "@/lib/cards/page-jobs";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily sweep of scanned pages: a page whose reading died an hour or
 * more ago is marked failed (so its queue is announced and can be
 * retaken), and anything a week old is removed, photos and all. See
 * `sweepPageScans`.
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
  return Response.json({ ok: true, ...(await sweepPageScans()) });
}
