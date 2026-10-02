import "server-only";

import { notifyThreadTrade } from "@/lib/notifications/notify";
import { awardTradeEmbers } from "@/lib/players/embers";
import { recordTradeFound } from "@/lib/players/hunts";
import { blockedBetween } from "@/lib/players/safety";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { disputeTrade } from "./repository";
import { THREAD_TRADE_QUANTITY_MAX } from "./thread-trade-copy";

/**
 * "We traded", inside a conversation.
 *
 * The audit of 2026-10-01: "zero confirmed trades in 30 days suggests
 * confirming is too hard, and confirming is the only way to earn
 * Embers." A trade could only be written in a room, by a Flare's
 * author. Most trades are arranged in a conversation and happen
 * wherever the two people met, so the conversation is now a place a
 * trade can be confirmed: either side says it, the other side is asked
 * "did you?", and the second tap pays both under the same rules a room
 * trade pays by (the pair ladder, the weekly ceiling, the late rate
 * when nobody answers).
 *
 * The card is the conversation's own when it has one: a thread on a
 * Flare or a saved want is about exactly one card, so nobody retypes
 * it. A direct message is about nothing in particular, so there the
 * person saying "We traded" picks the card and says which way it went.
 *
 * ONE PENDING TRADE PER CONVERSATION. Until the other side has
 * answered, or the window has closed, a second "We traded" is refused:
 * two unanswered claims in one thread is how "did you?" stops meaning
 * anything.
 */

export type ThreadTradeStatus = "pending" | "confirmed" | "late" | "declined";

export interface ThreadTrade {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  quantity: number;
  /** The card came TO the viewer. */
  got: boolean;
  /** The viewer is the one who said it. */
  saidByYou: boolean;
  status: ThreadTradeStatus;
  /** True while the viewer's own answer is what the trade waits for. */
  awaitingYou: boolean;
  proposedAt: string;
}

export type ThreadTradeFailure =
  | "unavailable"
  | "not-found"
  | "closed"
  | "pending"
  | "already-traded"
  | "no-card"
  | "answered";

export { THREAD_TRADE_QUANTITY_MAX } from "./thread-trade-copy";

interface ThreadRow {
  id: string;
  flare_id: string | null;
  want_id: string | null;
  author_player_id: string;
  responder_player_id: string;
  closed_at: string | null;
}

async function threadRow(threadId: string): Promise<ThreadRow | null> {
  const { data } = await getSupabaseAdmin()
    .from("flare_threads")
    .select("id, flare_id, want_id, author_player_id, responder_player_id, closed_at")
    .eq("id", threadId)
    .maybeSingle();
  return data ?? null;
}

function isParty(thread: ThreadRow, playerId: string): boolean {
  return (
    thread.author_player_id === playerId || thread.responder_player_id === playerId
  );
}

function statusOf(row: {
  acknowledged_at: string | null;
  paid_at: string | null;
  disputed_at: string | null;
}): ThreadTradeStatus {
  if (row.disputed_at) return "declined";
  if (row.acknowledged_at) return "confirmed";
  if (row.paid_at) return "late";
  return "pending";
}

/**
 * The newest trade said in a conversation, as one side sees it, or
 * null when nobody has said one. Read by `readThread`, so the thread
 * screen draws the state without a second request.
 */
export async function latestThreadTrade(
  threadId: string,
  viewerId: string,
): Promise<ThreadTrade | null> {
  if (!isSupabaseConfigured()) return null;
  const admin = getSupabaseAdmin();

  const { data: row } = await admin
    .from("trades")
    .select(
      "id, card_id, quantity, requester_player_id, holder_player_id, proposed_by, confirmed_at, acknowledged_at, paid_at, disputed_at, flare_id",
    )
    .eq("thread_id", threadId)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  const [{ data: card }, showcase] = await Promise.all([
    admin
      .from("cards")
      .select("exact_name, canonical_card_number")
      .eq("id", row.card_id)
      .maybeSingle(),
    row.flare_id
      ? admin
          .from("flares")
          .select("intent")
          .eq("id", row.flare_id)
          .maybeSingle()
          .then((result) => result.data?.intent === "showcase")
      : Promise.resolve(false),
  ]);

  const requester = row.requester_player_id === viewerId;
  /* On a want the requester got it; on a showcase they let it go. */
  const got = showcase ? !requester : requester;
  const status = statusOf(row);

  return {
    id: row.id,
    cardId: row.card_id,
    cardName: card?.exact_name ?? "Unknown card",
    cardNumber: card?.canonical_card_number ?? "",
    quantity: row.quantity,
    got,
    saidByYou: row.proposed_by === viewerId,
    status,
    awaitingYou: status === "pending" && row.proposed_by !== viewerId,
    proposedAt: row.confirmed_at,
  };
}

/** The Flare closes as traded once its own author has a hand on it. */
async function closeFlareAsTraded(flareId: string, quantity: number): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("flares")
    .update({ status: "traded", updated_at: new Date().toISOString() })
    .eq("id", flareId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (data) await recordTradeFound(flareId, quantity);
}

export interface ProposeInput {
  /** Required on a direct message; ignored when the thread has a card. */
  cardId?: string | null;
  printingId?: string | null;
  quantity: number;
  /** On a direct message: the card came to the person saying it. */
  got?: boolean;
}

/**
 * "We traded": one side's word, written as a trade that waits for the
 * other side's. Either chair can say it.
 */
export async function proposeThreadTrade(
  threadId: string,
  viewerId: string,
  input: ProposeInput,
): Promise<
  { ok: true; trade: ThreadTrade } | { ok: false; reason: ThreadTradeFailure }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const thread = await threadRow(threadId);
  if (!thread || !isParty(thread, viewerId)) return { ok: false, reason: "not-found" };
  if (thread.closed_at) return { ok: false, reason: "closed" };

  const otherId =
    thread.author_player_id === viewerId
      ? thread.responder_player_id
      : thread.author_player_id;
  if (await blockedBetween(viewerId, otherId)) return { ok: false, reason: "closed" };

  const admin = getSupabaseAdmin();

  const { data: open } = await admin
    .from("trades")
    .select("id")
    .eq("thread_id", threadId)
    .is("acknowledged_at", null)
    .is("paid_at", null)
    .is("disputed_at", null)
    .limit(1)
    .maybeSingle();
  if (open) return { ok: false, reason: "pending" };

  const quantity = Math.min(
    THREAD_TRADE_QUANTITY_MAX,
    Math.max(1, Math.round(input.quantity || 1)),
  );

  /*
   * The card, and which side is the "requester" in a room's sense.
   *
   * A Flare or a want names its card and its owner; the owner sits in
   * the requester's chair and the trade reads the same way a room's
   * does (on a showcase the owner is letting the card go, and the
   * history already knows to flip that). A direct message has neither,
   * so the person saying "We traded" picks the card, says whether it
   * came to them, and the chairs follow from that.
   */
  let cardId: string;
  let printingId: string | null = null;
  let requesterId: string;
  let holderId: string;
  let flareId: string | null = null;
  let authorSaid = false;

  if (thread.flare_id) {
    const { data: flare } = await admin
      .from("flares")
      .select("id, card_id, printing_id")
      .eq("id", thread.flare_id)
      .maybeSingle();
    if (!flare) return { ok: false, reason: "no-card" };
    cardId = flare.card_id;
    printingId = flare.printing_id;
    flareId = flare.id;
    requesterId = thread.author_player_id;
    holderId = thread.responder_player_id;
    authorSaid = viewerId === thread.author_player_id;
  } else if (thread.want_id) {
    const { data: want } = await admin
      .from("player_wants")
      .select("id, card_id")
      .eq("id", thread.want_id)
      .maybeSingle();
    if (!want) return { ok: false, reason: "no-card" };
    cardId = want.card_id;
    requesterId = thread.author_player_id;
    holderId = thread.responder_player_id;
  } else {
    if (!input.cardId) return { ok: false, reason: "no-card" };
    const { data: card } = await admin
      .from("cards")
      .select("id")
      .eq("id", input.cardId)
      .maybeSingle();
    if (!card) return { ok: false, reason: "no-card" };
    cardId = card.id;
    if (input.printingId) {
      const { data: printing } = await admin
        .from("card_printings")
        .select("id")
        .eq("id", input.printingId)
        .eq("card_id", cardId)
        .maybeSingle();
      printingId = printing?.id ?? null;
    }
    const got = input.got !== false;
    requesterId = got ? viewerId : otherId;
    holderId = got ? otherId : viewerId;
  }

  const { data: inserted, error } = await admin
    .from("trades")
    .insert({
      event_id: null,
      thread_id: threadId,
      flare_id: flareId,
      requester_session_id: null,
      holder_session_id: null,
      requester_player_id: requesterId,
      holder_player_id: holderId,
      proposed_by: viewerId,
      card_id: cardId,
      printing_id: printingId,
      quantity,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted) {
    /* One trade per Flare, whichever place it was confirmed in. */
    if (error?.code === "23505") return { ok: false, reason: "already-traded" };
    console.error("Could not write the conversation's trade", error);
    return { ok: false, reason: "unavailable" };
  }

  if (flareId && authorSaid) await closeFlareAsTraded(flareId, quantity);

  await notifyThreadTrade(threadId, inserted.id, viewerId, otherId, "proposed");

  const trade = await latestThreadTrade(threadId, viewerId);
  return trade ? { ok: true, trade } : { ok: false, reason: "unavailable" };
}

/**
 * The other side's answer. Yes is the second hand on the trade, and the
 * moment it pays both. No takes the claim back: the trade stops
 * counting, and the person who said it is told.
 */
export async function answerThreadTrade(
  tradeId: string,
  viewerId: string,
  yes: boolean,
): Promise<{ ok: true } | { ok: false; reason: ThreadTradeFailure }> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  const { data: trade } = await admin
    .from("trades")
    .select(
      "id, thread_id, flare_id, quantity, requester_player_id, holder_player_id, proposed_by, acknowledged_at, paid_at, disputed_at",
    )
    .eq("id", tradeId)
    .maybeSingle();

  if (
    !trade ||
    !trade.thread_id ||
    (trade.requester_player_id !== viewerId && trade.holder_player_id !== viewerId)
  ) {
    return { ok: false, reason: "not-found" };
  }
  /* Your own claim is not yours to confirm. */
  if (trade.proposed_by === viewerId) return { ok: false, reason: "not-found" };
  if (trade.acknowledged_at || trade.paid_at || trade.disputed_at) {
    return { ok: false, reason: "answered" };
  }

  const proposer = trade.proposed_by ?? null;

  if (!yes) {
    const done = await disputeTrade(
      tradeId,
      "The other side said this trade did not happen",
      viewerId,
    );
    if (!done) return { ok: false, reason: "unavailable" };
    if (proposer) {
      await notifyThreadTrade(trade.thread_id, tradeId, viewerId, proposer, "declined");
    }
    return { ok: true };
  }

  const { data: updated, error } = await admin
    .from("trades")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", tradeId)
    .is("acknowledged_at", null)
    .is("disputed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    console.error("Could not confirm the conversation's trade", error);
    return { ok: false, reason: "unavailable" };
  }

  await awardTradeEmbers(tradeId, "acknowledged");

  /* The Flare's author just agreed: their Flare is done. */
  if (trade.flare_id && trade.requester_player_id === viewerId) {
    await closeFlareAsTraded(trade.flare_id, trade.quantity);
  }

  if (proposer) {
    await notifyThreadTrade(trade.thread_id, tradeId, viewerId, proposer, "confirmed");
  }
  return { ok: true };
}
