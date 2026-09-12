import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { ReportRange } from "./activity-range";

/**
 * What happened in a window, counted.
 *
 * The founder, on the admin players page: an endless list of guest
 * sessions was "not necessary, maybe just a counter somewhere of all
 * guests that were in cardflare during a certain period... some
 * metrics and report to be able to pull." So: counts only, never a
 * list of strangers, over the window the report page asks for.
 */
export interface ActivityReport {
  /** Guest sessions that began in the window: scans with no account behind them. */
  guestsNew: number;
  /** Guest sessions seen at all in the window, new or returning. */
  guestsActive: number;
  /** Player accounts created in the window. */
  accountsNew: number;
  /** Seats taken in rooms: one per person per room. */
  roomSeats: number;
  /** Rooms that opened: walk-in rooms started at a counter, and scheduled events created. */
  roomsWalkIn: number;
  roomsScheduled: number;
  /** Flares posted, by who posted them. */
  flaresByGuests: number;
  flaresByAccounts: number;
  /** Hands raised on Flares. */
  offers: number;
  /** Trades confirmed. */
  trades: number;
}

const EMPTY: ActivityReport = {
  guestsNew: 0,
  guestsActive: 0,
  accountsNew: 0,
  roomSeats: 0,
  roomsWalkIn: 0,
  roomsScheduled: 0,
  flaresByGuests: 0,
  flaresByAccounts: 0,
  offers: 0,
  trades: 0,
};

/** Flares are fetched as rows to sort guest from account; this caps a runaway window. */
const FLARE_ROWS = 20_000;

export async function activityReport(range: ReportRange): Promise<ActivityReport> {
  if (!isSupabaseConfigured()) return EMPTY;

  const admin = getSupabaseAdmin();

  const counted = async (
    table: string,
    column: string,
    refine?: (q: ReturnType<ReturnType<typeof admin.from>["select"]>) => typeof q,
  ): Promise<number> => {
    let query = admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte(column, range.from)
      .lt(column, range.to);
    if (refine) query = refine(query);
    const { count, error } = await query;
    if (error) console.error(`Could not count ${table}`, error);
    return count ?? 0;
  };

  const [
    guestsNew,
    guestsActive,
    accountsNew,
    roomSeats,
    roomsWalkIn,
    roomsScheduled,
    offers,
    trades,
    flares,
  ] = await Promise.all([
    counted("player_sessions", "created_at", (q) => q.is("player_id", null)),
    counted("player_sessions", "last_seen_at", (q) => q.is("player_id", null)),
    counted("players", "created_at"),
    counted("event_participants", "joined_at"),
    counted("events", "created_at", (q) => q.eq("kind", "walk_in")),
    counted("events", "created_at", (q) => q.neq("kind", "walk_in")),
    counted("flare_responses", "created_at"),
    counted("trades", "confirmed_at"),
    admin
      .from("flares")
      .select("player_id, player_session_id")
      .gte("created_at", range.from)
      .lt("created_at", range.to)
      .limit(FLARE_ROWS),
  ]);

  if (flares.error) console.error("Could not read Flares for the report", flares.error);

  /*
   * Who posted each Flare. An account posting from nowhere carries its
   * player id; a board post carries a session, and the account behind
   * the session, if any, decides. Sessions are looked up in one query.
   */
  const rows = (flares.data ?? []) as {
    player_id: string | null;
    player_session_id: string | null;
  }[];
  const sessionIds = [
    ...new Set(
      rows
        .filter((row) => !row.player_id && row.player_session_id)
        .map((row) => row.player_session_id as string),
    ),
  ];

  const accountSessions = new Set<string>();
  if (sessionIds.length > 0) {
    const { data, error } = await admin
      .from("player_sessions")
      .select("id, player_id")
      .in("id", sessionIds);
    if (error) console.error("Could not read sessions for the report", error);
    for (const row of data ?? []) {
      if (row.player_id) accountSessions.add(row.id);
    }
  }

  let flaresByGuests = 0;
  let flaresByAccounts = 0;
  for (const row of rows) {
    const byAccount =
      Boolean(row.player_id) ||
      (row.player_session_id !== null && accountSessions.has(row.player_session_id));
    if (byAccount) flaresByAccounts += 1;
    else flaresByGuests += 1;
  }

  return {
    guestsNew,
    guestsActive,
    accountsNew,
    roomSeats,
    roomsWalkIn,
    roomsScheduled,
    flaresByGuests,
    flaresByAccounts,
    offers,
    trades,
  };
}
