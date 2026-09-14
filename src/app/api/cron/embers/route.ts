import { ACKNOWLEDGE_WINDOW_HOURS } from "@/lib/players/ember-rules";
import { payLateTrades } from "@/lib/trades/repository";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sweep behind two-sided confirmation.
 *
 * A trade pays when the partner taps "yes". A partner who never taps
 * would otherwise leave the author waiting forever, so once the window
 * has passed the author is paid alone at the unconfirmed rate and the
 * trade is settled. Vercel's cron calls this daily; every trade it
 * settles is marked paid, so a re-run finds nothing to do.
 *
 * Guarded by CRON_SECRET, fail-closed, like the board-open cron.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  const settled = await payLateTrades(ACKNOWLEDGE_WINDOW_HOURS);
  return Response.json({ ok: true, settled });
}
