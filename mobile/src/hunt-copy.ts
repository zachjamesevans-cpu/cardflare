/**
 * The line under a hunt's name, on its row and on its page: the app's
 * half of src/lib/players/hunt-copy.ts, the same body word for word,
 * which tests/unit/hunts-binder-parity.test.ts holds to.
 *
 * A hunt is drawn like a binder now, so its row says what a binder's
 * row says, how many cards, and then the one thing a binder never has
 * to say: how many are still out there. `cards` is every card on the
 * hunt, found or not; `left` is the ones still looking.
 */
export function huntRowLine(cards: number, left: number): string {
  if (cards === 0) return "No cards yet";
  return `${cards} ${cards === 1 ? "card" : "cards"} · ${left === 0 ? "All found" : `${left} left`}`;
}
