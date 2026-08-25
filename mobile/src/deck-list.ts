/**
 * A pasted deck list, turned into wants.
 *
 * OP-17 lands this week and the founder wants players posting whole want
 * lists ahead of it: "we need a way to post multiple flares at once —
 * such as if you're building a massive deck."
 *
 * Pasting is the shape rather than a grid of tick boxes, for a reason
 * that is about card games and not about forms: a deck already EXISTS as
 * text. It comes out of a deck builder, a Discord message or a friend's
 * screenshot as a list of numbers, and the fastest path from that to a
 * board is somewhere to put it. Ticking twenty-four boxes is slower than
 * pasting twenty-four lines even when the boxes are perfect.
 *
 * What lands here becomes saved wants under one deck label. The room's
 * existing "still hunting these?" panel posts them as ONE batch, which
 * is what makes the whole list a single notification and a single Feed
 * item rather than twenty-four of each.
 *
 * The app's copy of `src/lib/players/deck-list.ts`, kept in step by
 * `tests/unit/deck-list.test.ts`, which imports both and walks the same
 * cases through each. A phone reading a pasted list differently from the
 * website would drop a card on one platform and not the other.
 */

/** A line the parser understood. */
export interface DeckLine {
  /** The printed identifier, upper-cased. */
  cardNumber: string;
  quantity: number;
}

/** The most cards one paste may carry. A deck is fifty-one plus a leader. */
export const DECK_LIST_MAX = 120;

/** Per card. The board's own cap is lower; this only stops a typo. */
export const DECK_LINE_MAX_QUANTITY = 20;

/**
 * Reads one line of a deck list.
 *
 * Every shape a deck builder actually emits, because the point of
 * pasting is not having to reformat first:
 *
 *   OP17-001            a card
 *   4x OP17-001         a count in front, the usual export
 *   4xOP17-001          the same glued, the simulator's export
 *   4 OP17-001          the same without the x
 *   OP17-001 x4         a count behind, which some builders do
 *   4x OP17-001 Luffy   a name after the number, which most do
 *
 * The card NUMBER is the identity and the name is ignored: names differ
 * by printing, language and punctuation, and a list that half-matches on
 * names is worse than one that says plainly what it could not find.
 */
export function parseDeckLine(line: string): DeckLine | null {
  const pasted = line.trim();

  /* Comments and section headers, which builders emit freely. */
  if (!pasted || pasted.startsWith("#") || pasted.startsWith("//")) return null;

  /*
   * "1xOP14-020" — the count glued straight onto the number, which is
   * what the simulator and the deck sites export. Un-glued before
   * scanning, because otherwise the x reads as the set code's first
   * letter: the number regex matched "XOP14-020", a card that exists in
   * no catalogue, and the founder's whole paste came back unknown.
   */
  const trimmed = pasted.replace(/^(\d{1,2})\s*[xX](?=[A-Za-z])/, "$1 ");

  const number = /[A-Za-z]{2,4}\d{2}-\d{2,3}/.exec(trimmed);
  if (!number) return null;

  const cardNumber = number[0].toUpperCase();

  /* A count before the number, or after it. Anchored to the number's own
     position so "OP17-001" cannot read its own digits as a quantity. */
  const before = /(?:^|\s)(\d{1,2})\s*[xX]?\s*$/.exec(trimmed.slice(0, number.index));
  const after = /^\s*[xX]?\s*(\d{1,2})(?:\s|$)/.exec(
    trimmed.slice(number.index + cardNumber.length),
  );

  const raw = Number(before?.[1] ?? after?.[1] ?? 1);
  const quantity = Math.min(
    Math.max(Number.isFinite(raw) && raw > 0 ? raw : 1, 1),
    DECK_LINE_MAX_QUANTITY,
  );

  return { cardNumber, quantity };
}

/**
 * Reads a whole pasted list.
 *
 * Duplicate numbers are summed rather than kept apart — a builder that
 * lists a card on two lines means four of it, not two entries — and the
 * order of first appearance is kept, so what comes back reads like what
 * was pasted.
 */
export function parseDeckList(text: string): {
  lines: DeckLine[];
  /** Lines with no card number in them, kept so they can be shown back. */
  unreadable: string[];
} {
  const byNumber = new Map<string, DeckLine>();
  const unreadable: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    const line = parseDeckLine(trimmed);

    if (!line) {
      unreadable.push(trimmed.slice(0, 80));
      continue;
    }

    const existing = byNumber.get(line.cardNumber);
    byNumber.set(line.cardNumber, {
      cardNumber: line.cardNumber,
      quantity: Math.min(
        (existing?.quantity ?? 0) + line.quantity,
        DECK_LINE_MAX_QUANTITY,
      ),
    });
  }

  return { lines: [...byNumber.values()].slice(0, DECK_LIST_MAX), unreadable };
}

/** Digits and letters only, matching `cards.compact_card_number`. */
export function compactCardNumber(cardNumber: string): string {
  return cardNumber.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
