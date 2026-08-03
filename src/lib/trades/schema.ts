/**
 * Trade history and the binder nudge, free of server-only imports so the
 * rules can be tested without a database.
 *
 * A trade is written once, by the Flare's author, when the cards change
 * hands. Everything here is how the two players then *see* it: the history
 * rows for "traded tonight", and the one-tap prompt that keeps the holder's
 * binder from quietly rotting.
 */

/** One trade, as the room renders it for one viewer. */
export interface TradeRecord {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  quantity: number;
  /** Which side of it the viewer was on. */
  youWere: "requester" | "holder";
  /** Null when the partner never tapped "offer", or their session expired. */
  partnerName: string | null;
  confirmedAt: string;
}

/**
 * "You traded this away — is it still in your binder?"
 *
 * The binder rots the moment a trade happens, and Milestone 6's answer to
 * rot (confirm on arrival) cannot help mid-event. This is the other half:
 * after a trade in which the viewer was the holder, any binder entry for
 * that card that has not been confirmed *since the trade* earns a one-tap
 * prompt — remove it, or say it is still there.
 *
 * Keyed entirely off `confirmed_at` timestamps that already exist. "Still
 * have it" re-confirms the entry, which hides the prompt without any new
 * state to store; "remove" is the ordinary binder removal.
 */
export interface BinderPrompt {
  entryId: string;
  cardName: string;
  tradeId: string;
}

export function binderPrompts(
  trades: TradeRecord[],
  binder: {
    id: string;
    cardId: string;
    cardName: string;
    confirmedAt: string | null;
  }[],
): BinderPrompt[] {
  const prompts: BinderPrompt[] = [];

  for (const entry of binder) {
    /*
     * A missing or unreadable confirmation must read as stale, and it does by
     * arithmetic rather than by a branch: NaN fails every comparison, so
     * `confirmedAt >= tradeTime` — the only thing that suppresses a prompt —
     * can never be true for it. Same stance as `needsConfirming`.
     */
    const confirmedAt = entry.confirmedAt
      ? new Date(entry.confirmedAt).getTime()
      : Number.NaN;

    const trade = trades.find(
      (candidate) =>
        candidate.youWere === "holder" &&
        candidate.cardId === entry.cardId &&
        !(confirmedAt >= new Date(candidate.confirmedAt).getTime()),
    );

    if (trade) {
      prompts.push({ entryId: entry.id, cardName: entry.cardName, tradeId: trade.id });
    }
  }

  return prompts;
}
