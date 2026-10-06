import "server-only";

import { sendCardsMessage } from "@/lib/local/threads";
import { blockedBetween } from "@/lib/players/safety";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { binderOwner, readBinder } from "./binder";
import { BINDER_OFFER_MAX_CARDS, binderOfferBody } from "./offer-copy";

/**
 * An offer on somebody's trade binder: the cards picked in the viewer,
 * sent as one message in the pair's conversation that carries them.
 *
 * A binder card is no Flare, so nothing here touches offers on posts;
 * the conversation is the whole of it, which is what the founder asked
 * for: "Can then DM them about them." Only a binder up for trade can be
 * offered on (`readBinder` hides any other from a visitor), never your
 * own, and never across a block.
 */

export type BinderOfferFailure =
  "unavailable" | "not-found" | "yours" | "blocked" | "empty";

export interface BinderOfferItem {
  entryId: string;
  quantity: number;
}

export async function offerOnBinder(
  binderId: string,
  viewerId: string,
  items: BinderOfferItem[],
  note: string | null,
): Promise<
  | { ok: true; threadId: string; count: number; ownerName: string }
  | { ok: false; reason: BinderOfferFailure }
> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };

  const ownerId = await binderOwner(binderId);
  if (!ownerId) return { ok: false, reason: "not-found" };
  if (ownerId === viewerId) return { ok: false, reason: "yours" };

  const binder = await readBinder(ownerId, viewerId, binderId);
  if (!binder || !binder.forTrade) return { ok: false, reason: "not-found" };
  if (await blockedBetween(viewerId, ownerId)) return { ok: false, reason: "blocked" };

  /* The binder's own entries, once each, at most what it holds. */
  const byEntry = new Map(binder.cards.map((card) => [card.entryId, card]));
  const seen = new Set<string>();
  const lines = items.flatMap((item) => {
    const card = byEntry.get(item.entryId);
    if (!card || seen.has(item.entryId)) return [];
    seen.add(item.entryId);
    const quantity = Math.min(
      card.quantity,
      Math.max(1, Math.round(item.quantity || 1)),
    );
    return [{ card, quantity }];
  });
  if (lines.length === 0) return { ok: false, reason: "empty" };
  const picked = lines.slice(0, BINDER_OFFER_MAX_CARDS);

  const body = binderOfferBody(
    binder.name,
    picked.map(({ card, quantity }) => ({ name: card.name, quantity })),
    note,
  );
  /* Each picked entry once, with the printing the owner put in the
     binder, so the chat shows the same art the binder does. */
  const threadId = await sendCardsMessage(
    viewerId,
    ownerId,
    body,
    picked.map(({ card }) => card.cardId),
    picked.map(({ card }) => card.printingId),
  );
  if (!threadId) return { ok: false, reason: "unavailable" };

  return { ok: true, threadId, count: picked.length, ownerName: binder.ownerName };
}
