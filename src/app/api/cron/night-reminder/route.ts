import { formatEventMoment } from "@/lib/events/format";
import { nightMatches } from "@/lib/events/night-matches";
import { listParticipants } from "@/lib/events/participants";
import { boardReadable, roomPhase } from "@/lib/events/schema";
import { notifyNightReminder } from "@/lib/notifications/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The reminder on the day of a night.
 *
 * Runs once a day at 16:00 UTC, which is the morning in the Americas
 * and the late afternoon in Europe, and reminds everyone going to a
 * scheduled night that starts in the next HORIZON hours: the time, the
 * matches on the board for them, the cards to bring. A night further
 * out waits for tomorrow's run; one already finished is skipped. The
 * per-night, per-player dedupe key makes a rerun free.
 *
 * Bounded: a run reminds at most NOTICE_CAP players, so a sudden
 * hundred nights cannot run the function past its minute. What is
 * left is said in the response rather than swallowed.
 *
 * Guarded by CRON_SECRET, and fail-closed.
 */

/** How far ahead a night may start and still be "today". */
const HORIZON_MS = 14 * 60 * 60 * 1000;
/** Notices per run. */
const NOTICE_CAP = 150;

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
    .select("id, name, store_id, kind, status, starts_at, ends_at, join_code")
    .eq("kind", "scheduled")
    .is("cancelled_at", null)
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + HORIZON_MS).toISOString());

  if (error) {
    console.error("Could not list today's nights", error);
    return Response.json({ ok: false }, { status: 500 });
  }

  const storeIds = [...new Set((events ?? []).map((row) => row.store_id))];
  const { data: stores } =
    storeIds.length > 0
      ? await admin
          .from("stores")
          .select("id, name, join_code, early_board_hours, timezone")
          .in("id", storeIds)
      : { data: [] };
  const storeById = new Map((stores ?? []).map((row) => [row.id, row]));

  let sent = 0;
  let considered = 0;
  let truncated = false;

  for (const event of events ?? []) {
    const store = storeById.get(event.store_id);
    if (!store) continue;
    const phase = roomPhase(
      {
        kind: event.kind,
        status: event.status,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        earlyBoardHours: store.early_board_hours,
        storeTimeZone: store.timezone,
      },
      now,
    );
    if (!boardReadable(phase)) continue;

    const when = formatEventMoment(event.starts_at, store.timezone);
    const code = event.join_code ?? store.join_code;
    const roster = await listParticipants(event.id);
    const players = [
      ...new Set(roster.flatMap((row) => (row.playerId ? [row.playerId] : []))),
    ];

    for (const playerId of players) {
      if (considered >= NOTICE_CAP) {
        truncated = true;
        break;
      }
      considered += 1;
      const matches = await nightMatches(event.id, playerId);
      const delivered = await notifyNightReminder({
        playerId,
        eventId: event.id,
        eventName: event.name,
        storeName: store.name,
        when,
        code,
        matches: matches.summary.total,
        bring: matches.bring.length,
      });
      if (delivered) sent += 1;
    }
    if (truncated) break;
  }

  return Response.json({
    ok: true,
    nights: (events ?? []).length,
    considered,
    sent,
    truncated,
  });
}
