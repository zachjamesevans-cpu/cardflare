import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { EmberReason } from "@/lib/supabase/types";
import {
  SEASON_DAYS,
  ageInDays,
  attendanceRef,
  attendancePays,
  embersForLateTrade,
  embersForTrade,
  tradeAwardRef,
  tradeReversalRef,
} from "./ember-rules";

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
 * Hands a player Embers WITHOUT crediting the badge.
 *
 * The founder's rule for admin grants: a gift must not show up on
 * somebody's profile as trading they did not do. So this moves the
 * spendable balance and writes `earned_delta = 0`, and the lifetime
 * total keeps meaning one thing.
 *
 * Its own function rather than a flag on `awardEmbers`, because the two
 * have different invariants and a boolean argument is how somebody
 * eventually passes the wrong one.
 */
export async function grantSpendableEmbers(
  playerId: string,
  amount: number,
  ref: string,
  note?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || amount <= 0) return false;

  const { data, error } = await getSupabaseAdmin().rpc("grant_embers", {
    target_player: playerId,
    amount,
    grant_ref: ref,
    grant_note: note ?? null,
  });

  if (error) {
    console.error("Could not grant Embers", error);
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

/** Takes Embers back, once per ref. See reverse_embers in the migration. */
export async function reverseEmbers(
  playerId: string,
  amount: number,
  ref: string,
  note?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || amount <= 0) return false;

  const { data, error } = await getSupabaseAdmin().rpc("reverse_embers", {
    target_player: playerId,
    amount,
    reversal_ref: ref,
    reversal_note: note ?? null,
  });

  if (error) {
    console.error("Could not reverse Embers", error);
    return false;
  }

  return data === true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Paid trades between two accounts this season, before the one being
 * paid now.
 *
 * Asked through sessions rather than accounts because `trades` records
 * who was in the room, and a room identity is per-device and per-event.
 * One account can hold many over a season, so "how often have we met"
 * is a question about the union of both sets.
 */
async function pairTradesThisSeason(
  aSessions: string[],
  bSessions: string[],
  exceptTradeId: string,
): Promise<number> {
  if (aSessions.length === 0 || bSessions.length === 0) return 0;

  const admin = getSupabaseAdmin();
  const since = new Date(Date.now() - SEASON_DAYS * DAY_MS).toISOString();

  const [oneWay, otherWay] = await Promise.all([
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .in("requester_session_id", aSessions)
      .in("holder_session_id", bSessions)
      .not("paid_at", "is", null)
      .is("disputed_at", null)
      .gt("confirmed_at", since)
      .neq("id", exceptTradeId),
    admin
      .from("trades")
      .select("id", { count: "exact", head: true })
      .in("requester_session_id", bSessions)
      .in("holder_session_id", aSessions)
      .not("paid_at", "is", null)
      .is("disputed_at", null)
      .gt("confirmed_at", since)
      .neq("id", exceptTradeId),
  ]);

  if (oneWay.error || otherWay.error) {
    /*
     * Fail toward the smaller award. Paying the new-partner rate on a
     * failed lookup would make "make the history query fail" the way to
     * farm the badge; paying as if the ladder were spent costs an honest
     * player one night's Embers on a database blip, the cheaper mistake.
     */
    console.error("Could not count a pair's trades", oneWay.error ?? otherWay.error);
    return 99;
  }

  return (oneWay.count ?? 0) + (otherWay.count ?? 0);
}

/** This player's paid trades in one room, before the one being paid now. */
async function roomPaidTrades(
  sessions: string[],
  eventId: string,
  exceptTradeId: string,
): Promise<number> {
  if (sessions.length === 0) return 0;
  const list = sessions.join(",");

  const { count, error } = await getSupabaseAdmin()
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .or(`requester_session_id.in.(${list}),holder_session_id.in.(${list})`)
    .not("paid_at", "is", null)
    .is("disputed_at", null)
    .neq("id", exceptTradeId);

  if (error) {
    console.error("Could not count a room's trades", error);
    return 99;
  }
  return count ?? 0;
}

/** Embers this player earned from trades in the last seven days. */
async function weekEarned(playerId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("ember_ledger")
    .select("earned_delta")
    .eq("player_id", playerId)
    .eq("reason", "trade")
    .gt("created_at", new Date(Date.now() - 7 * DAY_MS).toISOString());

  if (error) {
    console.error("Could not sum the week's Embers", error);
    return 0;
  }
  return (data ?? []).reduce((sum, row) => sum + row.earned_delta, 0);
}

async function accountAge(playerId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("created_at")
    .eq("id", playerId)
    .maybeSingle();
  return data ? ageInDays(data.created_at) : 0;
}

/**
 * Pays out a trade, to both sides, once both hands are on it.
 *
 * Called after the partner acknowledged, never before: a trade is
 * confirmed when the author says so and CORROBORATED when the partner
 * does, and only the second earns. Failure here is logged and
 * swallowed - a trade that happened and did not pay is a support
 * question, a confirm that rolled back because the reward system was
 * down is a player at a counter unable to finish. The trade is the
 * product; the Embers are the garnish.
 *
 * Guests earn nothing, because there is no account to hold it.
 *
 * `late` is the other door: the partner never answered inside the
 * window, so the author gets the unconfirmed rate and the partner
 * nothing. One tap from the partner before the window closes turns it
 * into the full amount instead.
 */
export async function awardTradeEmbers(
  tradeId: string,
  mode: "acknowledged" | "late",
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();
    const { data: trade } = await admin
      .from("trades")
      .select(
        "id, event_id, requester_session_id, holder_session_id, paid_at, disputed_at",
      )
      .eq("id", tradeId)
      .maybeSingle();
    if (!trade || trade.paid_at || trade.disputed_at) return;

    const [requester, holder] = await Promise.all([
      trade.requester_session_id
        ? playerBehindSession(trade.requester_session_id)
        : Promise.resolve(null),
      trade.holder_session_id
        ? playerBehindSession(trade.holder_session_id)
        : Promise.resolve(null),
    ]);

    const now = new Date().toISOString();
    const partnerKnown = Boolean(requester && holder && requester !== holder);

    if (mode === "late") {
      if (requester && partnerKnown) {
        const amount = embersForLateTrade(await weekEarned(requester));
        await awardEmbers(
          requester,
          amount,
          "trade",
          tradeAwardRef(tradeId, requester),
          "Trade, partner did not confirm",
        );
      }
      await admin.from("trades").update({ paid_at: now }).eq("id", tradeId);
      return;
    }

    if (!partnerKnown || !requester || !holder) {
      /* Nobody named, or the same account on both ends: on the tally,
         off the badge. Marked paid so the sweep never revisits it. */
      await admin.from("trades").update({ paid_at: now }).eq("id", tradeId);
      return;
    }

    const [rSessions, hSessions, rAge, hAge] = await Promise.all([
      sessionsForPlayer(requester),
      sessionsForPlayer(holder),
      accountAge(requester),
      accountAge(holder),
    ]);
    const pair = await pairTradesThisSeason(rSessions, hSessions, tradeId);

    const sides = [
      { id: requester, sessions: rSessions, age: rAge, partnerAge: hAge },
      { id: holder, sessions: hSessions, age: hAge, partnerAge: rAge },
    ];

    await Promise.all(
      sides.map(async (side) => {
        const [room, week] = await Promise.all([
          roomPaidTrades(side.sessions, trade.event_id, tradeId),
          weekEarned(side.id),
        ]);
        const amount = embersForTrade({
          partnerKnown: true,
          pairTradesThisSeason: pair,
          roomPaidTrades: room,
          weekEarned: week,
          accountAgeDays: side.age,
          partnerAgeDays: side.partnerAge,
        });
        if (amount > 0) {
          await awardEmbers(
            side.id,
            amount,
            "trade",
            tradeAwardRef(tradeId, side.id),
            "Confirmed trade",
          );
        }
      }),
    );

    await admin.from("trades").update({ paid_at: now }).eq("id", tradeId);
  } catch (error) {
    console.error("Could not award Embers for a trade", error);
  }
}

/**
 * Takes back what one trade paid, both sides, and marks it disputed.
 *
 * The award ledger rows say exactly what was paid, so the reversal is
 * their mirror and nothing is guessed. Idempotent through the reversal
 * refs; a second dispute of the same trade changes nothing.
 */
export async function reverseTradeEmbers(
  tradeId: string,
  note: string,
  disputedBy: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const admin = getSupabaseAdmin();
    const { data: awards } = await admin
      .from("ember_ledger")
      .select("player_id, earned_delta")
      .like("ref", `trade:${tradeId}:%`)
      .eq("reason", "trade");

    await Promise.all(
      (awards ?? []).map((award) =>
        reverseEmbers(
          award.player_id,
          award.earned_delta,
          tradeReversalRef(tradeId, award.player_id),
          note,
        ),
      ),
    );

    const { error } = await admin
      .from("trades")
      .update({
        disputed_at: new Date().toISOString(),
        disputed_by: disputedBy,
        dispute_note: note.slice(0, 200),
        paid_at: new Date().toISOString(),
      })
      .eq("id", tradeId)
      .is("disputed_at", null);

    if (error) {
      console.error("Could not mark the trade disputed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Could not reverse a trade", error);
    return false;
  }
}

/**
 * Turning up: one Ember for joining a room at a store the player had
 * ALREADY saved, once per store per day, capped per week.
 *
 * The one thing besides a trade that pays, and it is small on purpose:
 * it gives a new player their first tier in about a month of showing
 * up, which is what the ladder needs, and it cannot be farmed faster
 * than a calendar. "Already saved" is the corroboration: the first
 * join at a store saves it, so the first night pays nothing.
 */
export async function awardAttendance(
  playerId: string,
  storeId: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const admin = getSupabaseAdmin();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const [{ data: local }, { count }] = await Promise.all([
      admin
        .from("player_locals")
        .select("created_at")
        .eq("player_id", playerId)
        .eq("store_id", storeId)
        .maybeSingle(),
      admin
        .from("ember_ledger")
        .select("id", { count: "exact", head: true })
        .eq("player_id", playerId)
        .eq("reason", "attendance")
        .gt("created_at", new Date(Date.now() - 7 * DAY_MS).toISOString()),
    ]);

    if (!local || Date.parse(local.created_at) >= dayStart.getTime()) return;
    if (!attendancePays(count ?? 0)) return;

    const day = dayStart.toISOString().slice(0, 10);
    await awardEmbers(
      playerId,
      1,
      "attendance",
      attendanceRef(playerId, storeId, day),
      "Turned up at a saved store",
    );
  } catch (error) {
    console.error("Could not award attendance", error);
  }
}
