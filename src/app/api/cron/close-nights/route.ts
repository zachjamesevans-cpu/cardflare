import { sweepEndedScheduledEvents } from "@/lib/events/rooms";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Closes the nights whose end has passed.
 *
 * A scheduled night is opened by its store and ends at `ends_at`, and
 * until now the only thing that closed it was the next scan of its code.
 * A night nobody scanned after closing time stayed "open" in the
 * database: listed as live, taking Going, trades and "open to trades".
 * `roomPhase` already reads such a night as finished; this makes the row
 * say so too, and settles each closed weekly night's next occurrence,
 * the same sweep the scan runs (`sweepEndedScheduledEvents`), so a
 * repeat of either is free.
 *
 * Guarded by CRON_SECRET, and fail-closed: no secret configured means
 * no run, never an open endpoint.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  await sweepEndedScheduledEvents(new Date().toISOString());
  return Response.json({ ok: true });
}
