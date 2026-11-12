/**
 * "12 hunting · 3 have it for trade": a card's standing, in one line.
 *
 * What a price would tell somebody deciding whether a trade is worth a
 * walk across the shop, said the only way cardflare says it: by how
 * many people are after the card and how many will let one go. Never a
 * number with a currency on it. See PRODUCT.md, "Never a price."
 *
 * Both counts are of things already public on the card's own page (the
 * two lists under it), so the line is a summary and reveals nothing
 * the page does not.
 *
 * Pure, and the app's copy is held to this one by a parity test.
 */
export interface CardDemand {
  /** Players with an open Flare or a public hunt for it. */
  hunters: number;
  /** Players with it in a binder up for trade. */
  holders: number;
}

const whole = (n: number | undefined) =>
  n !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

/** The line, or null when nobody is on either side yet. */
export function demandLine(demand: CardDemand | null | undefined): string | null {
  const hunters = whole(demand?.hunters);
  const holders = whole(demand?.holders);
  const parts = [
    hunters > 0 ? `${hunters} hunting` : null,
    holders > 0 ? `${holders} ${holders === 1 ? "has" : "have"} it for trade` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}
