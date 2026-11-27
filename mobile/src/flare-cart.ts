import { useEffect, useState } from "react";

import { storedAccessToken } from "./api";
import { cachedPlayerId, readCache, writeCache } from "./cache";
import type { PickedLine } from "./card-select";

/**
 * YOUR FLARE, AS A CART. The founder (2026-11-25): "when pressing the +
 * button, it just has ... similar function to how when you add something
 * to cart, it just tallies up, then you can view 'full cart' ... this
 * would prevent a pop up screen from sliding up for every card added."
 *
 * The cart IS the composer's saved draft (the same cache entry, the same
 * account key), so nothing new is stored: the + on a card appends the art
 * on show to it, the + over the tab bar wears its count, and the composer
 * is the full cart, where it is reviewed and posted. The composer tells
 * this store whenever it saves, so the count is always the draft's.
 */

type Line = PickedLine;

interface SavedDraft {
  v: 1;
  items: Line[];
  intent: "want" | "showcase";
  caption: string;
  hunt: unknown;
  acceptsTrade: boolean;
  acceptsCash: boolean;
}

const EMPTY: SavedDraft = {
  v: 1,
  items: [],
  intent: "want",
  caption: "",
  hunt: null,
  acceptsTrade: true,
  acceptsCash: false,
};

/** Copies of one art the + adds up to: the composer's own limit. */
export const MAX_COPIES = 99;

type Held = { cardId: string; printingId: string | null; quantity: number };
let lines: Held[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((listener) => listener());

/** The composer's draft key: the account, or "guest" with no session. */
async function draftKey(): Promise<string> {
  if (!(await storedAccessToken())) return "guest";
  return (await cachedPlayerId()) ?? "guest";
}

async function readDraft(): Promise<SavedDraft> {
  const saved = await readCache<SavedDraft>("composer", await draftKey());
  return saved && saved.v === 1 && Array.isArray(saved.items) ? saved : EMPTY;
}

type Saved = { cardId: string; printingId: string | null; quantity?: number };

function remember(items: readonly Saved[]): void {
  lines = items.map((item) => ({
    cardId: item.cardId,
    printingId: item.printingId ?? null,
    quantity: Math.max(1, item.quantity ?? 1),
  }));
  tell();
}

/** Read once; again after `force` (a sign-in, a post). */
export function loadCart(force = false): Promise<void> {
  if (loaded && !force) return loaded;
  loaded = readDraft().then((draft) => remember(draft.items));
  return loaded;
}

/** The composer saved its draft: the cart is what it saved. */
export function cartSaved(items: readonly Saved[]): void {
  remember(items);
}

/** This card and art (or the card, for "any") is in the cart. */
export function inCart(cardId: string, printingId: string | null): boolean {
  return lines.some((line) => line.cardId === cardId && line.printingId === printingId);
}

/** Copies of this card and art in the cart; 0 for none. */
export function copiesInCart(cardId: string, printingId: string | null): number {
  return (
    lines.find((line) => line.cardId === cardId && line.printingId === printingId)?.quantity ?? 0
  );
}

/**
 * Copies in the cart, the way a shopping bag counts: 4 Peronas and a
 * Zoro are 5. The founder (2026-11-27) chose copies over cards.
 */
export function cartCount(): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Put a copy in the cart: a new card at the end (the first card stays the
 * cover), or one more copy of an art already there. The founder
 * (2026-11-27): "lets say youre building a deck and you need 4x op12-034
 * peronas. you should be able to tap the + button 4 times quickly to add
 * 4 copies." Adds run one after another, so four fast taps are four
 * copies, never two that read the same draft.
 */
export function addToCart(line: Line): Promise<{ outcome: "added" | "full"; copies: number }> {
  const run = queue.then(() => addOne(line));
  queue = run.catch(() => undefined);
  return run;
}

let queue: Promise<unknown> = Promise.resolve();

async function addOne(line: Line): Promise<{ outcome: "added" | "full"; copies: number }> {
  const key = await draftKey();
  const draft = await readDraft();
  const at = draft.items.findIndex(
    (item) => item.cardId === line.cardId && (item.printingId ?? null) === line.printingId,
  );
  if (at !== -1 && draft.items[at].quantity >= MAX_COPIES) {
    remember(draft.items);
    return { outcome: "full", copies: draft.items[at].quantity };
  }
  const items =
    at === -1
      ? [...draft.items, { ...line, quantity: 1 }]
      : draft.items.map((item, index) =>
          index === at ? { ...item, quantity: item.quantity + 1 } : item,
        );
  const next: SavedDraft = { ...draft, intent: "want", items };
  await writeCache("composer", key, next);
  remember(next.items);
  return { outcome: "added", copies: at === -1 ? 1 : items[at].quantity };
}

/** Re-render on any change to the cart; loads it the first time. */
export function useFlareCart(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    void loadCart();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return version;
}
