/**
 * The rules a Flare draft is built on, pure so both composers and the
 * server can share them and a test can pin them.
 */

export interface DraftItem {
  cardId: string;
  printingId: string | null;
  quantity: number;
}

export const MAX_COPIES = 99;

/**
 * The same card and printing twice is more copies of it, never two
 * lines. Order is the order first seen, which is the cover rule.
 */
export function mergeItems<T extends DraftItem>(items: T[]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const item of items) {
    const key = `${item.cardId}::${item.printingId ?? "any"}`;
    const quantity = Math.min(MAX_COPIES, Math.max(1, Math.round(item.quantity)));
    const index = at.get(key);
    if (index === undefined) {
      at.set(key, out.length);
      out.push({ ...item, quantity });
    } else {
      out[index] = {
        ...out[index],
        quantity: Math.min(MAX_COPIES, out[index].quantity + quantity),
      };
    }
  }
  return out;
}

/** "3 cards · 7 copies", counting cards and copies as two things. */
export function draftSummary(items: { quantity: number }[]): string {
  const cards = items.length;
  const copies = items.reduce((sum, item) => sum + item.quantity, 0);
  return `${cards} ${cards === 1 ? "card" : "cards"} · ${copies} ${copies === 1 ? "copy" : "copies"}`;
}

/** "5 copies left · 2 cards", the collapsed hunt line. */
export function remainingLabel(cards: { remaining: number }[]): string {
  const open = cards.filter((card) => card.remaining > 0);
  const copies = open.reduce((sum, card) => sum + card.remaining, 0);
  if (copies === 0) return "All found";
  return `${copies} ${copies === 1 ? "copy" : "copies"} left · ${open.length} ${
    open.length === 1 ? "card" : "cards"
  }`;
}

/** Copies still wanted of a posted card, from the one record that holds it. */
export function remainingCopies(
  flare: { quantity: number; foundQuantity: number; status: string },
  request: { needed: number; found: number } | null,
): number {
  if (flare.status === "traded") return 0;
  if (request)
    return Math.max(0, Math.min(flare.quantity, request.needed - request.found));
  return Math.max(0, flare.quantity - flare.foundQuantity);
}
