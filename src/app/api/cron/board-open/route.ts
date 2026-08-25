import { earlyBoardOpensAt } from "@/lib/events/schema";
import { notifyBoardOpen } from "@/lib/notifications/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The clock the doorbell hangs on.
 *
 * Everything else in cardflare is triggered lazily by traffic, and that
 * is exactly why this route exists: the whole point of "the board is
 * open" is to reach people when nothing is happening yet. Vercel's cron
 * calls this hourly; each run finds scheduled draft events whose board
 * has opened (the store's early window or midnight of event day,
 * whichever came first, decided by the same helper every phase check
 * uses) and rings notifyBoardOpen for each. Per-player dedupe keys make
 * every repeat visit to an already-open board free, so the run does not
 * need to remember anything between ticks.
 *
 * Guarded by CRON_SECRET, and fail-closed: no secret configured means
 * no run, never an open endpoint.
 */

/** How far ahead an event can start and still be board-open now: the
    widest early window a store can set, plus a day for the midnight leg. */
const HORIZON_MS = (14 * 24 + 24) * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  const now = Date.now();
  const admin = getSupabaseAdmin();

  const { data: events, error } = await admin
    .from("events")
    .select("id, starts_at, store_id")
    .eq("kind", "scheduled")
    .eq("status", "draft")
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + HORIZON_MS).toISOString());

  if (error) {
    console.error("Could not list upcoming boards", error);
    return Response.json({ ok: false }, { status: 500 });
  }

  const storeIds = [...new Set((events ?? []).map((row) => row.store_id))];
  const { data: stores } =
    storeIds.length > 0
      ? await admin
          .from("stores")
          .select("id, early_board_hours, timezone")
          .in("id", storeIds)
      : { data: [] };

  const storeById = new Map((stores ?? []).map((row) => [row.id, row]));

  const open = (events ?? []).filter((event) => {
    const store = storeById.get(event.store_id);
    if (!store) return false;
    const opensAt = earlyBoardOpensAt({
      startsAt: event.starts_at,
      earlyBoardHours: store.early_board_hours,
      storeTimeZone: store.timezone,
    });
    return opensAt !== null && opensAt <= now;
  });

  for (const event of open) {
    await notifyBoardOpen(event.id);
  }

  return Response.json({ ok: true, checked: (events ?? []).length, open: open.length });
}
