import { sweepGifts } from "@/lib/stores/gifts";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily turn of every Ultra gift: the week-out reminder, the
 * last-day reminder, and the end. See `sweepGifts`; each step stamps
 * the store before the next, so a rerun sends nothing twice.
 *
 * Runs at 15:00 UTC, the morning in the Americas, so a shop owner reads
 * "last day" with the day still ahead of them. Guarded by CRON_SECRET,
 * and fail-closed.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  return Response.json({ ok: true, ...(await sweepGifts()) });
}
