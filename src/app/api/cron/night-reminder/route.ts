import { formatEventMoment } from "@/lib/events/format";
import { nightMatches } from "@/lib/events/night-matches";
import { listParticipants } from "@/lib/events/participants";
import { boardReadable, roomPhase } from "@/lib/events/schema";
import { notifyNightReminder } from "@/lib/notifications/notify";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The reminder before a night.
 *
 * Runs every 30 minutes and reminds everyone going to a scheduled night
 * that starts within the next HORIZON hours: the time, the matches on
 * the board for them, the cards to bring. A fixed daily run reminded a
 * 7pm night in Sydney at 2am; this way the reminder lands a couple of
 * hours before doors wherever the store is.
 *
 * Once per player per night. The notification's dedupe key
 * (`reminder:<night>:<player>`) is the sent-marker: players who already
 * have one are skipped before any work is done for them, so a run only
 * spends time on people still owed a reminder.
 *
 * No cap that starves anyone: a run works through every due player,
 * night by night, and stops only when it nears the function's time
 * limit (TIME_BUDGET_MS). Whoever it did not reach is still unmarked,
 * so the next run, half an hour later and well inside the horizon,
 * picks them up first. What was left is said in the response.
 *
 * Guarded by CRON_SECRET, and fail-closed.
 */

/** How far ahead a night may start and still be reminded about now. */
const HORIZON_MS = 3 * 60 * 60 * 1000;
/** Stop starting new players this far into the run; maxDuration is 60s. */
const TIME_BUDGET_MS = 45 * 1000;
/** Dedupe keys looked up per query. */
const KEY_PAGE = 200;

const reminderKey = (eventId: string, playerId: string) =>
  `reminder:${eventId}:${playerId}`;

/** The players of one night who already have their reminder. */
async function alreadyReminded(eventId: string, players: string[]): Promise<Set<string>> {
  const admin = getSupabaseAdmin();
  const done = new Set<string>();
  for (let start = 0; start < players.length; start += KEY_PAGE) {
    const page = players.slice(start, start + KEY_PAGE);
    const { data, error } = await admin
      .from("notifications")
      .select("dedupe_key")
      .in(
        "dedupe_key",
        page.map((playerId) => reminderKey(eventId, playerId)),
      );
    if (error) {
      /* Unknown is not "nobody": the dedupe key still stops a repeat. */
      console.error("Could not read who was reminded", error);
      continue;
    }
    for (const row of data ?? []) {
      const playerId = row.dedupe_key?.split(":")[2];
      if (playerId) done.add(playerId);
    }
  }
  return done;
}

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
    .lte("starts_at", new Date(now + HORIZON_MS).toISOString())
    .order("starts_at");

  if (error) {
    console.error("Could not list the coming nights", error);
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
  let skipped = 0;
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
    const reminded = await alreadyReminded(event.id, players);
    skipped += reminded.size;

    for (const playerId of players) {
      if (reminded.has(playerId)) continue;
      if (Date.now() - now >= TIME_BUDGET_MS) {
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
    skipped,
    truncated,
  });
}
