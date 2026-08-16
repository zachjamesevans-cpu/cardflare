/**
 * What the card viewer says about a card you are holding — the app's copy
 * of the website's `youHaveLabel` in `src/lib/matching/schema.ts`, kept
 * word for word on purpose. Same rule as `pack-labels.ts`: the two clients
 * are one product, and a phrase that drifts between them is a phrase the
 * founder has to notice for us.
 *
 * The founder's three phrases, as three states of one line. Only ever
 * reached by tapping a card: the board marks what you hold with a green
 * ring, and a ring says "look here" in a glance, while a sentence on every
 * tile is a wall of them. The sentence is the answer to the tap.
 *
 * A count only appears above one, because "You have 1 in your binder" is a
 * worse way of saying "You have this". A printing you cannot prove never
 * carries a number at all: the interesting fact there is the mismatch, and
 * a count beside it reads as a promise about the wrong version.
 */
export function youHaveLabel(
  kind: "exact" | "other-printing",
  count: number,
): string {
  if (kind === "other-printing") return "You have another printing";
  return count > 1 ? `You have ${count} in your binder` : "You have this";
}
