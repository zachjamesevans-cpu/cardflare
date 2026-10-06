import { syncLapsedSubscriptions } from "@/lib/billing/expiry";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The moment a canceled Pro stops being Pro.
 *
 * Cancellation takes effect at the end of the paid period, and no
 * provider tells us when that moment arrives, so without this a lapsed
 * subscriber kept every Pro feature indefinitely. See
 * `syncLapsedSubscriptions`; it only ever asks the same tier sync the
 * webhooks use, so a rerun changes nothing.
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

  const result = await syncLapsedSubscriptions();
  return Response.json({ ok: !result.failed, ...result }, {
    status: result.failed ? 500 : 200,
  });
}
