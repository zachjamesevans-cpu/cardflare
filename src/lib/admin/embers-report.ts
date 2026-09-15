import "server-only";

import { NEW_ACCOUNT_DAYS } from "@/lib/players/ember-rules";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import type { ReportRange } from "./activity-range";

/**
 * The Embers report: who earned, from whom, and what looks wrong.
 *
 * Four lists, each the shape of one way to farm the badge. Top earners
 * for a glance; pairs trading with each other over and over; accounts
 * under two weeks old that earned more than a good night; and trades
 * whose two people joined the room within a minute of each other, the
 * signature of one person with two phones. Every row names the trade
 * an admin can dispute, which takes both sides' Embers back.
 */

export interface EarnerRow {
  playerId: string;
  displayName: string;
  handle: string | null;
  earned: number;
  accountAgeDays: number;
}

export interface PairRow {
  a: { playerId: string; displayName: string };
  b: { playerId: string; displayName: string };
  trades: number;
  tradeIds: string[];
}

export interface TradeRow {
  tradeId: string;
  confirmedAt: string;
  cardName: string;
  requester: { playerId: string | null; displayName: string };
  holder: { playerId: string | null; displayName: string };
  status: "pending" | "confirmed" | "late" | "unnamed" | "disputed";
  /** Seconds between the two people joining the room, when both did. */
  joinGapSeconds: number | null;
}

export interface EmbersReport {
  earned: number;
  reversed: number;
  topEarners: EarnerRow[];
  busyPairs: PairRow[];
  youngEarners: EarnerRow[];
  quickJoins: TradeRow[];
  recentTrades: TradeRow[];
}

const EMPTY: EmbersReport = {
  earned: 0,
  reversed: 0,
  topEarners: [],
  busyPairs: [],
  youngEarners: [],
  quickJoins: [],
  recentTrades: [],
};

const BUSY_PAIR_TRADES = 3;
const YOUNG_EARNED_OVER = 20;
const QUICK_JOIN_SECONDS = 60;

export async function embersReport(range: ReportRange): Promise<EmbersReport> {
  if (!isSupabaseConfigured()) return EMPTY;

  const admin = getSupabaseAdmin();

  const [{ data: ledger }, { data: trades }] = await Promise.all([
    admin
      .from("ember_ledger")
      .select("player_id, reason, earned_delta, balance_delta, created_at")
      .gte("created_at", range.from)
      .lt("created_at", range.to)
      .limit(20_000),
    admin
      .from("trades")
      .select(
        "id, event_id, flare_id, requester_session_id, holder_session_id, card_id, confirmed_at, acknowledged_at, paid_at, disputed_at",
      )
      .gte("confirmed_at", range.from)
      .lt("confirmed_at", range.to)
      .order("confirmed_at", { ascending: false })
      .limit(2_000),
  ]);

  const rows = ledger ?? [];
  const earnedBy = new Map<string, number>();
  let earned = 0;
  let reversed = 0;
  for (const row of rows) {
    if (row.reason === "reversal") {
      reversed += -row.balance_delta;
      continue;
    }
    if (row.earned_delta > 0) {
      earned += row.earned_delta;
      earnedBy.set(
        row.player_id,
        (earnedBy.get(row.player_id) ?? 0) + row.earned_delta,
      );
    }
  }

  const tradeRows = trades ?? [];
  const sessionIds = [
    ...new Set(
      tradeRows.flatMap((row) =>
        [row.requester_session_id, row.holder_session_id].filter(
          (id): id is string => id !== null,
        ),
      ),
    ),
  ];

  const [{ data: sessions }, { data: cards }, { data: participants }] =
    await Promise.all([
      sessionIds.length
        ? admin
            .from("player_sessions")
            .select("id, display_name, player_id")
            .in("id", sessionIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              display_name: string;
              player_id: string | null;
            }[],
          }),
      tradeRows.length
        ? admin
            .from("cards")
            .select("id, exact_name")
            .in("id", [...new Set(tradeRows.map((row) => row.card_id))])
        : Promise.resolve({ data: [] as { id: string; exact_name: string }[] }),
      sessionIds.length
        ? admin
            .from("event_participants")
            .select("event_id, player_session_id, joined_at")
            .in("player_session_id", sessionIds)
        : Promise.resolve({
            data: [] as {
              event_id: string;
              player_session_id: string;
              joined_at: string;
            }[],
          }),
    ]);

  const sessionById = new Map((sessions ?? []).map((row) => [row.id, row]));
  const cardById = new Map((cards ?? []).map((row) => [row.id, row.exact_name]));
  const joinedAt = new Map(
    (participants ?? []).map((row) => [
      `${row.event_id}:${row.player_session_id}`,
      row.joined_at,
    ]),
  );

  const playerIds = [
    ...new Set([
      ...earnedBy.keys(),
      ...(sessions ?? []).flatMap((row) => (row.player_id ? [row.player_id] : [])),
    ]),
  ];
  const { data: players } = playerIds.length
    ? await admin
        .from("players")
        .select("id, display_name, handle, created_at")
        .in("id", playerIds)
    : {
        data: [] as {
          id: string;
          display_name: string;
          handle: string | null;
          created_at: string;
        }[],
      };
  const playerById = new Map((players ?? []).map((row) => [row.id, row]));

  const ageDays = (createdAt: string | undefined) =>
    createdAt ? Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000) : 0;

  const earners: EarnerRow[] = [...earnedBy.entries()]
    .map(([playerId, total]) => {
      const player = playerById.get(playerId);
      return {
        playerId,
        displayName: player?.display_name ?? "Deleted account",
        handle: player?.handle ?? null,
        earned: total,
        accountAgeDays: ageDays(player?.created_at),
      };
    })
    .sort((a, b) => b.earned - a.earned);

  const person = (sessionId: string | null) => {
    const session = sessionId ? sessionById.get(sessionId) : undefined;
    const player = session?.player_id ? playerById.get(session.player_id) : undefined;
    return {
      playerId: session?.player_id ?? null,
      displayName: player?.display_name ?? session?.display_name ?? "Nobody named",
    };
  };

  const shaped: TradeRow[] = tradeRows.map((row) => {
    const requesterJoin = row.requester_session_id
      ? joinedAt.get(`${row.event_id}:${row.requester_session_id}`)
      : undefined;
    const holderJoin = row.holder_session_id
      ? joinedAt.get(`${row.event_id}:${row.holder_session_id}`)
      : undefined;
    const gap =
      requesterJoin && holderJoin
        ? Math.abs(Date.parse(requesterJoin) - Date.parse(holderJoin)) / 1000
        : null;
    return {
      tradeId: row.id,
      confirmedAt: row.confirmed_at,
      cardName: cardById.get(row.card_id) ?? "Unknown card",
      requester: person(row.requester_session_id),
      holder: person(row.holder_session_id),
      status: row.disputed_at
        ? "disputed"
        : !row.holder_session_id
          ? "unnamed"
          : row.acknowledged_at
            ? "confirmed"
            : row.paid_at
              ? "late"
              : "pending",
      joinGapSeconds: gap,
    };
  });

  const pairs = new Map<string, PairRow>();
  for (const trade of shaped) {
    if (!trade.requester.playerId || !trade.holder.playerId) continue;
    const [a, b] = [trade.requester, trade.holder].sort((x, y) =>
      (x.playerId ?? "").localeCompare(y.playerId ?? ""),
    );
    const key = `${a.playerId}:${b.playerId}`;
    const row = pairs.get(key) ?? {
      a: { playerId: a.playerId ?? "", displayName: a.displayName },
      b: { playerId: b.playerId ?? "", displayName: b.displayName },
      trades: 0,
      tradeIds: [],
    };
    row.trades += 1;
    row.tradeIds.push(trade.tradeId);
    pairs.set(key, row);
  }

  return {
    earned,
    reversed,
    topEarners: earners.slice(0, 10),
    busyPairs: [...pairs.values()]
      .filter((row) => row.trades >= BUSY_PAIR_TRADES)
      .sort((x, y) => y.trades - x.trades)
      .slice(0, 20),
    youngEarners: earners
      .filter(
        (row) =>
          row.accountAgeDays < NEW_ACCOUNT_DAYS && row.earned > YOUNG_EARNED_OVER,
      )
      .slice(0, 20),
    quickJoins: shaped
      .filter(
        (trade) =>
          trade.joinGapSeconds !== null &&
          trade.joinGapSeconds <= QUICK_JOIN_SECONDS &&
          trade.status !== "disputed",
      )
      .slice(0, 20),
    recentTrades: shaped.slice(0, 50),
  };
}
