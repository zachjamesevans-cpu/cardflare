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

let lines: { cardId: string; printingId: string | null }[] = [];
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

function remember(items: readonly { cardId: string; printingId: string | null }[]): void {
  lines = items.map((item) => ({ cardId: item.cardId, printingId: item.printingId ?? null }));
  tell();
}

/** Read once; again after `force` (a sign-in, a post). */
export function loadCart(force = false): Promise<void> {
  if (loaded && !force) return loaded;
  loaded = readDraft().then((draft) => remember(draft.items));
  return loaded;
}

/** The composer saved its draft: the cart is what it saved. */
export function cartSaved(items: readonly { cardId: string; printingId: string | null }[]): void {
  remember(items);
}

/** This card and art (or the card, for "any") is in the cart. */
export function inCart(cardId: string, printingId: string | null): boolean {
  return lines.some((line) => line.cardId === cardId && line.printingId === printingId);
}

export function cartCount(): number {
  return lines.length;
}

/**
 * Put a card in the cart, at the end (the first card stays the cover).
 * Already there with the same art: nothing changes, and it says so.
 */
export async function addToCart(line: Line): Promise<"added" | "already"> {
  const key = await draftKey();
  const draft = await readDraft();
  if (
    draft.items.some(
      (item) => item.cardId === line.cardId && (item.printingId ?? null) === line.printingId,
    )
  ) {
    remember(draft.items);
    return "already";
  }
  const next: SavedDraft = { ...draft, intent: "want", items: [...draft.items, line] };
  await writeCache("composer", key, next);
  remember(next.items);
  return "added";
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
