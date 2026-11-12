/**
 * "Traded with 7 players", under the bio on a profile.
 *
 * The website's line, word for word: src/lib/trades/partner-rules.ts
 * has the reasoning (people, not trades, and only trades both sides
 * said yes to), and tests/unit/trade-partners.test.ts holds the two
 * copies together.
 */

/** The line itself, or null when there is nothing to say yet. */
export function tradePartnersLine(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count < 1) return null;
  const whole = Math.floor(count);
  return whole === 1 ? "Traded with 1 player" : `Traded with ${whole} players`;
}
