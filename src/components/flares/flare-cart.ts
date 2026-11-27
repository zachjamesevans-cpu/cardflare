"use client";

import { useEffect, useState } from "react";

import { variantName } from "@/lib/cards/price-shape";
import type { CardResult } from "@/lib/cards/schema";

import { MAX_COPIES } from "@/lib/flares/draft-rules";

import { addCard, EMPTY_DRAFT, loadDraft, saveDraft } from "./draft";

/**
 * YOUR FLARE, AS A CART, on the website: the composer's own draft in this
 * browser (draft.ts), so nothing new is stored. The + on a card appends
 * the art on show to it without leaving the page; the + elsewhere wears
 * its count and opens /flare, the full cart. The founder (2026-11-25):
 * "it just tallies up, then you can view 'full cart'." The app's
 * mobile/src/flare-cart.ts is the same.
 */

/** Fired when the + writes the draft; the composer reloads its cards. */
export const CART_CHANGED = "cf-flare-cart";
const CHANGED = CART_CHANGED;

/** The cards in the draft, as card, printing and copies. */
function lines(): { cardId: string; printingId: string | null; quantity: number }[] {
  return (loadDraft()?.cards ?? []).map((line) => ({
    cardId: line.card.id,
    printingId: line.printingId,
    quantity: line.quantity,
  }));
}

/** Copies of this card and art in the cart; 0 for none. */
export function copiesInCart(cardId: string, printingId: string | null): number {
  return (
    lines().find((line) => line.cardId === cardId && line.printingId === printingId)
      ?.quantity ?? 0
  );
}

export function inCart(cardId: string, printingId: string | null): boolean {
  return lines().some(
    (line) => line.cardId === cardId && line.printingId === printingId,
  );
}

/**
 * Copies in the cart, the way a shopping bag counts: 4 Peronas and a
 * Zoro are 5. The founder (2026-11-27) chose copies over cards.
 */
export function cartCount(): number {
  return lines().reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Put a copy in the cart: a new card at the end (the first card stays the
 * cover), or one more copy of an art already there. The founder
 * (2026-11-27): "you should be able to tap the + button 4 times quickly
 * to add 4 copies." Adds run one after another and the card is fetched
 * once, so four fast clicks are four copies.
 */
export function addToCart(
  cardId: string,
  printingId: string | null,
): Promise<AddResult> {
  const run = queue.then(() => addOne(cardId, printingId));
  queue = run.catch(() => undefined);
  return run;
}

type AddResult = {
  outcome: "added" | "full" | "failed";
  name?: string;
  copies?: number;
};

let queue: Promise<unknown> = Promise.resolve();
const fetched = new Map<string, Promise<CardResult | null>>();

function fetchCard(cardId: string): Promise<CardResult | null> {
  let card = fetched.get(cardId);
  if (!card) {
    card = fetch(`/api/v1/cards/${cardId}`)
      .then(async (response) =>
        response.ok ? ((await response.json()) as { card: CardResult }).card : null,
      )
      .catch(() => null);
    fetched.set(cardId, card);
    void card.then((found) => {
      if (!found) fetched.delete(cardId);
    });
  }
  return card;
}

async function addOne(cardId: string, printingId: string | null): Promise<AddResult> {
  if (copiesInCart(cardId, printingId) >= MAX_COPIES) {
    return { outcome: "full", copies: MAX_COPIES };
  }
  const card = await fetchCard(cardId);
  if (!card) return { outcome: "failed" };
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
    copies: copiesInCart(cardId, printingId),
    name:
      art && card.printings.length > 1 ? `${card.exactName} · ${art}` : card.exactName,
  };
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
