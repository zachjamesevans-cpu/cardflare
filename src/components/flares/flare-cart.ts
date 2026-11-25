"use client";

import { useEffect, useState } from "react";

import { variantName } from "@/lib/cards/price-shape";
import type { CardResult } from "@/lib/cards/schema";

import { addCard, EMPTY_DRAFT, loadDraft, saveDraft } from "./draft";

/**
 * YOUR FLARE, AS A CART, on the website: the composer's own draft in this
 * browser (draft.ts), so nothing new is stored. The + on a card appends
 * the art on show to it without leaving the page; the + elsewhere wears
 * its count and opens /flare, the full cart. The founder (2026-11-25):
 * "it just tallies up, then you can view 'full cart'." The app's
 * mobile/src/flare-cart.ts is the same.
 */

const CHANGED = "cf-flare-cart";

/** The cards in the draft, as card and printing. */
function lines(): { cardId: string; printingId: string | null }[] {
  return (loadDraft()?.cards ?? []).map((line) => ({
    cardId: line.card.id,
    printingId: line.printingId,
  }));
}

export function inCart(cardId: string, printingId: string | null): boolean {
  return lines().some(
    (line) => line.cardId === cardId && line.printingId === printingId,
  );
}

export function cartCount(): number {
  return lines().length;
}

/** Fetch the card and append it, the first card staying the cover. */
export async function addToCart(
  cardId: string,
  printingId: string | null,
): Promise<{ outcome: "added" | "already" | "failed"; name?: string }> {
  if (inCart(cardId, printingId)) return { outcome: "already" };
  try {
    const response = await fetch(`/api/v1/cards/${cardId}`);
    if (!response.ok) return { outcome: "failed" };
    const { card } = (await response.json()) as { card: CardResult };
    const printing = printingId
      ? card.printings.find((entry) => entry.id === printingId)
      : undefined;
    const draft = loadDraft() ?? EMPTY_DRAFT;
    saveDraft({
      ...draft,
      intent: "want",
      cards: addCard(draft.cards, card, printing),
    });
    window.dispatchEvent(new Event(CHANGED));
    /* "Perona · Alt Art", the art named when the card has more than one. */
    const art = printing?.variantType ? variantName(printing.variantType) : null;
    return {
      outcome: "added",
      name:
        art && card.printings.length > 1
          ? `${card.exactName} · ${art}`
          : card.exactName,
    };
  } catch {
    return { outcome: "failed" };
  }
}

/** The count, kept current across this tab and others. */
export function useCartCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => setCount(cartCount());
    read();
    window.addEventListener(CHANGED, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CHANGED, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return count;
}
