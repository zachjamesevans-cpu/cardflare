import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EmberReason } from "@/lib/supabase/types";
import { embersForTrade, tradeAwardRef } from "./ember-rules";

/**
 * The Embers economy, everywhere it touches the database.
 *
 * Every movement goes through `award_embers` or `spend_embers`, the two
 * `security definer` functions in the migration, and never through a
 * plain UPDATE on `players`. That is not ceremony: the ledger row and
 * the balance have to move in one statement or a crash between them
 * leaves a player paid but unrecorded, and the affordability check has
 * to sit inside the UPDATE's WHERE or two taps on Buy both succeed.
 * Doing it here in TypeScript would reintroduce both bugs.
 */

/** Lifetime totals for several players at once, for a roster or a board. */
export async function embersEarnedFor(
  playerIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (!isSupabaseConfigured() || playerIds.length === 0) return totals;

  const { data, error } = await getSupabaseAdmin()
    .from("players")
    .select("id, embers_earned")
    .in("id", [...new Set(playerIds)]);

  if (error) {
    console.error("Could not read Embers for a group of players", error);
    return totals;
  }

  for (const row of data ?? []) totals.set(row.id, row.embers_earned);
  return totals;
}

/**
 * Hands a player some Embers, once.
 *
 * Returns false when the ref has been seen before, which is the whole
 * point of the ref: a retried trade confirmation is free.
 */
export async function awardEmbers(
  playerId: string,
  amount: number,
  reason: EmberReason,
  ref: string,
  note?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || amount <= 0) return false;

  const { data, error } = await getSupabaseAdmin().rpc("award_embers", {
    target_player: playerId,
    amount,
    award_reason: reason,
    award_ref: ref,
    award_note: note ?? null,
  });

  if (error) {
    console.error("Could not award Embers", error);
    return false;
  }

  return data === true;
}

/**
 * Takes Embers for a purchase, once, and only if they are there.
 *
 * False means one of: not enough Embers, or this exact purchase already
 * happened. The caller cannot tell which apart, deliberately — both mean
 * "do not hand over the goods on the strength of this call".
 */
export async function spendEmbers(
  playerId: string,
  cost: number,
  ref: string,
  note?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { data, error } = await getSupabaseAdmin().rpc("spend_embers", {
    target_player: playerId,
    cost,
    spend_ref: ref,
    spend_note: note ?? null,
  });

  if (error) {
    console.error("Could not spend Embers", error);
    return false;
  }

  return data === true;
}

/** The player behind a room session, or null for a guest. */
async function playerBehindSession(sessionId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("player_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("Could not resolve the account behind a session", error);
    return null;
  }

  return data?.player_id ?? null;
}

/** Every session id an account has ever used. */
async function sessionsForPlayer(playerId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("player_sessions")
    .select("id")
    .eq("player_id", playerId);

  if (error) {
    console.error("Could not list an account's sessions", error);
    return [];
  }

  return (data ?? []).map((row) => row.id);
}

/**
 * Have these two accounts traded before tonight?
 *
 * Asked through sessions rather than accounts because `trades` records
 * who was in the room, and a room identity is per-device and per-event.
 * One account can hold many over a season, so "have we met" is a
 * question about the union of both sets.
 *
 * `exceptTradeId` excludes the trade being paid for right now, which
 * would otherwise count as its own precedent and make every trade a
 * repeat.
 */
async function tradedBefore(
  playerA: string,
  playerB: string,
  exceptTradeId: string,
): Promise<boolean> {
  const [aSessions, bSessions] = await Promise.all([
    sessionsForPlayer(playerA),
    sessionsForPlayer(playerB),
  ]);

  if (aSessions.length === 0 || bSessions.length === 0) return false;

  const admin = getSupabaseAdmin();

  const [oneWay, otherWay] = await Promise.all([
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .in("requester_session_id", aSessions)
      .in("holder_session_id", bSessions)
      .neq("id", exceptTradeId),
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .in("requester_session_id", bSessions)
      .in("holder_session_id", aSessions)
      .neq("id", exceptTradeId),
  ]);

  if (oneWay.error || otherWay.error) {
    /*
     * Fail toward the smaller award. Paying the new-partner rate on a
     * failed lookup would make "make the history query fail" the way to
     * farm the badge; paying the repeat rate costs an honest player 8
     * Embers on a database blip, which is the cheaper mistake.
     */
    console.error(
      "Could not check whether two players have traded",
      oneWay.error ?? otherWay.error,
    );
    return true;
  }

  return (oneWay.count ?? 0) + (otherWay.count ?? 0) > 0;
}

/**
 * Pays out a confirmed trade, to both sides.
 *
 * Called after the trade row exists, never before: the trade's id is the
 * idempotency key, so there is nothing to key against until it is
 * written. Failure here is logged and swallowed — a trade that happened
 * and did not pay is a support question, a confirm that rolled back
 * because the reward system was down is a player standing at a counter
 * unable to finish. The trade is the product; the Embers are the garnish.
 *
 * Guests earn nothing, because there is no account to hold it. That is
 * not a nudge toward signing up so much as arithmetic: a guest session
 * expires in thirty days and takes any badge with it.
 */
export async function awardTradeEmbers(
  tradeId: string,
  requesterSessionId: string,
  holderSessionId: string | null,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const [requester, holder] = await Promise.all([
      playerBehindSession(requesterSessionId),
      holderSessionId ? playerBehindSession(holderSessionId) : Promise.resolve(null),
    ]);

    if (!requester && !holder) return;

    const partnerKnown = Boolean(requester && holder);
    const repeat =
      requester && holder ? await tradedBefore(requester, holder, tradeId) : false;

    const amount = embersForTrade({ partnerKnown, tradedBefore: repeat });

    await Promise.all(
      [requester, holder]
        .filter((id): id is string => Boolean(id))
        .map((id) =>
          awardEmbers(
            id,
            amount,
            "trade",
            tradeAwardRef(tradeId, id),
            "Confirmed trade",
          ),
        ),
    );
  } catch (error) {
    console.error("Could not award Embers for a trade", error);
  }
}
