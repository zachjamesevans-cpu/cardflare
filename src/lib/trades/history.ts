import "server-only";

import { tradeAwardRef, tradeReversalRef } from "@/lib/players/ember-rules";
import { sessionsForPlayers } from "@/lib/players/accounts";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { tierAllows } from "@/lib/tiers";
import { cardCameToYou, tradeIdFromRef } from "./history-rules";
import type { TradeRecord } from "./schema";

/**
 * Everything a player ever traded, both sides, newest first.
 *
 * The founder's problem: "we forget what we trade sometimes and then
 * we see a missing page in our binder and are like wtf." This is the
 * page that was missing. Every confirmed trade is already a row with
 * names on it; this reads them back for one person, says which way
 * each card went, where, when, and what it paid in Embers.
 *
 * Pro reads the rows. Everyone gets the counts. The rows are withheld
 * HERE, on the server, not hidden behind a blur on the client - a free
 * player's phone never receives the list it is not allowed to show.
 */

export interface TradeHistoryEntry {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  quantity: number;
  /** The card came TO you. False: it left your binder. */
  got: boolean;
  partnerName: string | null;
  storeName: string | null;
  eventName: string | null;
  confirmedAt: string;
  status: TradeRecord["status"];
  /** What this trade paid you, net of any reversal. */
  embers: number;
}

export interface TradeHistoryTotals {
  trades: number;
  got: number;
  gave: number;
  /** Embers these trades paid, net. */
  embers: number;
}

export interface TradeHistory {
  /** The viewer is not Pro: `trades` is empty and the totals still true. */
  locked: boolean;
  totals: TradeHistoryTotals;
  trades: TradeHistoryEntry[];
}

const HISTORY_LIMIT = 300;

const EMPTY: TradeHistory = {
  locked: false,
  totals: { trades: 0, got: 0, gave: 0, embers: 0 },
  trades: [],
};

export async function listTradeHistory(
  playerId: string,
  tier: string | null,
): Promise<TradeHistory> {
  if (!isSupabaseConfigured()) return EMPTY;

  const admin = getSupabaseAdmin();
  const locked = !tierAllows(tier, "tradeHistory");

  const sessions = [...(await sessionsForPlayers([playerId])).keys()];
  if (sessions.length === 0) return { ...EMPTY, locked };

  const list = sessions.map((id) => `"${id}"`).join(",");
  const { data, error } = await admin
    .from("trades")
    .select(
      "id, event_id, flare_id, requester_session_id, holder_session_id, card_id, printing_id, quantity, confirmed_at, acknowledged_at, paid_at, disputed_at",
    )
    .or(`requester_session_id.in.(${list}),holder_session_id.in.(${list})`)
    .order("confirmed_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    console.error("Could not read the trade history", error);
    return { ...EMPTY, locked };
  }

  const rows = data ?? [];
  if (rows.length === 0) return { ...EMPTY, locked };

  const mine = new Set(sessions);
  const tradeIds = rows.map((row) => row.id);

  /* Which way each card went needs the Flare: on a want the requester
     got it, on a showcase the requester was letting it go. */
  const flareIds = rows.flatMap((row) => (row.flare_id ? [row.flare_id] : []));
  const [{ data: flares }, { data: ledger }] = await Promise.all([
    flareIds.length > 0
      ? admin.from("flares").select("id, intent").in("id", flareIds)
      : Promise.resolve({ data: [] as { id: string; intent: string }[] }),
    admin
      .from("ember_ledger")
      .select("ref, earned_delta")
      .eq("player_id", playerId)
      .in("reason", ["trade", "reversal"])
      .in("ref", [
        ...tradeIds.map((id) => tradeAwardRef(id, playerId)),
        ...tradeIds.map((id) => tradeReversalRef(id, playerId)),
      ]),
  ]);

  const intentByFlare = new Map((flares ?? []).map((row) => [row.id, row.intent]));
  const embersByTrade = new Map<string, number>();
  for (const row of ledger ?? []) {
    const tradeId = tradeIdFromRef(row.ref);
    if (!tradeId) continue;
    embersByTrade.set(tradeId, (embersByTrade.get(tradeId) ?? 0) + row.earned_delta);
  }

  const shaped = rows.map((row) => {
    const requester = row.requester_session_id
      ? mine.has(row.requester_session_id)
      : false;
    const showcase = row.flare_id
      ? intentByFlare.get(row.flare_id) === "showcase"
      : false;
    const got = cardCameToYou(requester, showcase);
    const status: TradeRecord["status"] = row.disputed_at
      ? "disputed"
      : !row.holder_session_id
        ? "unnamed"
        : row.acknowledged_at
          ? "confirmed"
          : row.paid_at
            ? "late"
            : "pending";
    const partnerId = requester ? row.holder_session_id : row.requester_session_id;
    return { row, got, status, partnerId, embers: embersByTrade.get(row.id) ?? 0 };
  });

  const totals: TradeHistoryTotals = {
    trades: shaped.length,
    got: shaped.filter((trade) => trade.got).length,
    gave: shaped.filter((trade) => !trade.got).length,
    embers: shaped.reduce((sum, trade) => sum + trade.embers, 0),
  };

  if (locked) return { locked, totals, trades: [] };

  const cardIds = [...new Set(rows.map((row) => row.card_id))];
  const partnerIds = [
    ...new Set(shaped.flatMap((trade) => (trade.partnerId ? [trade.partnerId] : []))),
  ];
  const eventIds = [...new Set(rows.map((row) => row.event_id))];

  const [cards, printings, partners, events] = await Promise.all([
    admin
      .from("cards")
      .select("id, exact_name, canonical_card_number")
      .in("id", cardIds),
    admin
      .from("card_printings")
      .select("id, card_id, image_url")
      .in("card_id", cardIds),
    partnerIds.length > 0
      ? admin.from("player_sessions").select("id, display_name").in("id", partnerIds)
      : Promise.resolve({
          data: [] as { id: string; display_name: string }[],
          error: null,
        }),
    admin.from("events").select("id, name, store_id").in("id", eventIds),
  ]);

  const storeIds = [...new Set((events.data ?? []).map((event) => event.store_id))];
  const stores =
    storeIds.length > 0
      ? await admin.from("stores").select("id, name").in("id", storeIds)
      : { data: [] as { id: string; name: string }[] };

  const cardById = new Map((cards.data ?? []).map((row) => [row.id, row]));
  const artByPrinting = new Map(
    (printings.data ?? []).map((row) => [row.id, row.image_url as string | null]),
  );
  const artByCard = new Map<string, string | null>();
  for (const row of printings.data ?? []) {
    if (!artByCard.has(row.card_id)) artByCard.set(row.card_id, row.image_url);
  }
  const names = new Map((partners.data ?? []).map((row) => [row.id, row.display_name]));
  const eventById = new Map((events.data ?? []).map((row) => [row.id, row]));
  const storeById = new Map((stores.data ?? []).map((row) => [row.id, row.name]));

  return {
    locked,
    totals,
    trades: shaped.map(({ row, got, status, partnerId, embers }) => {
      const card = cardById.get(row.card_id);
      const event = eventById.get(row.event_id);
      return {
        id: row.id,
        cardId: row.card_id,
        cardName: card?.exact_name ?? "Unknown card",
        cardNumber: card?.canonical_card_number ?? "",
        imageUrl:
          (row.printing_id ? artByPrinting.get(row.printing_id) : null) ??
          artByCard.get(row.card_id) ??
          null,
        quantity: row.quantity,
        got,
        partnerName: partnerId ? (names.get(partnerId) ?? null) : null,
        storeName: event ? (storeById.get(event.store_id) ?? null) : null,
        eventName: event?.name ?? null,
        confirmedAt: row.confirmed_at,
        status,
        embers,
      };
    }),
  };
}
