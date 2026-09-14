/**
 * What a trade is worth, in Embers.
 *
 * Pure and free of server-only imports so the numbers can be reasoned
 * about and tested on their own. Everything that touches the database
 * lives in `embers.ts`; this file only answers "how much".
 *
 * The founder's rule, unchanged: only a CONFIRMED trade earns anything.
 * Posting a Flare earns nothing, pledging earns nothing. The one act
 * the whole product exists to cause is the one that pays.
 *
 * The second round, the founder's "fix all holes": a trade pays when
 * BOTH hands are on it, the amount tapers per pair, per room and per
 * week, a young account earns at half rate, and a trade nobody was
 * named on pays nothing at all. Every curve here is a guard against a
 * specific way two friends could tap the badge into meaninglessness,
 * and every one of them leaves a real Friday night untouched.
 */

/** A season: how long a pair's history counts against them. */
export const SEASON_DAYS = 90;

/**
 * The pair ladder: what the first, second and third paid trade with
 * the same person earn inside a season. After that, nothing until the
 * season rolls over. Ten first because meeting somebody new is the
 * thing cardflare is for; the cheapest paid cosmetic is 150, so a new
 * player has something to aim at after a handful of nights.
 */
export const PAIR_LADDER = [10, 4, 2] as const;
export const EMBERS_NEW_PARTNER = PAIR_LADDER[0];

/** Per room: this many paid trades at full rate, this many at half, then zero. */
export const ROOM_FULL_TRADES = 5;
export const ROOM_HALF_TRADES = 5;

/** Per week: a soft ceiling. Past it a trade still counts, and pays this. */
export const WEEKLY_CEILING = 60;
export const EMBERS_PAST_CEILING = 1;

/** An account this young earns at half rate; two of them together earn this. */
export const NEW_ACCOUNT_DAYS = 14;
export const EMBERS_BOTH_NEW = 1;

/** A trade nobody was named on: on the store's tally, off the badge. */
export const EMBERS_UNNAMED_PARTNER = 0;

/**
 * The partner never answered. After the window the trade still pays
 * the author, at the corroborated-by-nobody rate, and the partner
 * nothing. One tap from them turns this into the full amount.
 */
export const ACKNOWLEDGE_WINDOW_HOURS = 24;
export const EMBERS_LATE_ACKNOWLEDGE = 3;

/** Turning up at a store you have saved: once per store per day, capped per week. */
export const EMBERS_ATTENDANCE = 1;
export const ATTENDANCE_WEEKLY_CAP = 3;

export interface TradeAwardInput {
  /** Somebody was named and raised a hand. False pays nothing. */
  partnerKnown: boolean;
  /** Paid trades between these two people this season, before this one. */
  pairTradesThisSeason: number;
  /** This player's paid trades in this room, before this one. */
  roomPaidTrades: number;
  /** Embers this player earned from trades in the last seven days. */
  weekEarned: number;
  /** How old this player's account is, in days. */
  accountAgeDays: number;
  /** How old the partner's account is, in days. */
  partnerAgeDays: number;
}

/**
 * How much a confirmed, acknowledged trade pays ONE side of it.
 *
 * The curves stack in a fixed order: the pair ladder sets the base,
 * the room taper scales it, account age scales it again, and the
 * weekly ceiling caps whatever is left. A base of zero is zero
 * whatever else is true; a positive base never rounds below one.
 */
export function embersForTrade(input: TradeAwardInput): number {
  if (!input.partnerKnown) return EMBERS_UNNAMED_PARTNER;

  const base: number = PAIR_LADDER[input.pairTradesThisSeason] ?? 0;
  if (base === 0) return 0;

  const roomFactor =
    input.roomPaidTrades < ROOM_FULL_TRADES
      ? 1
      : input.roomPaidTrades < ROOM_FULL_TRADES + ROOM_HALF_TRADES
        ? 0.5
        : 0;
  if (roomFactor === 0) return 0;

  const youngYou = input.accountAgeDays < NEW_ACCOUNT_DAYS;
  const youngThem = input.partnerAgeDays < NEW_ACCOUNT_DAYS;
  if (youngYou && youngThem) return EMBERS_BOTH_NEW;
  const ageFactor = youngYou ? 0.5 : 1;

  const amount = Math.max(1, Math.floor(base * roomFactor * ageFactor));

  return input.weekEarned >= WEEKLY_CEILING
    ? Math.min(amount, EMBERS_PAST_CEILING)
    : amount;
}

/** What the author gets when the partner never answered inside the window. */
export function embersForLateTrade(weekEarned: number): number {
  return weekEarned >= WEEKLY_CEILING
    ? Math.min(EMBERS_LATE_ACKNOWLEDGE, EMBERS_PAST_CEILING)
    : EMBERS_LATE_ACKNOWLEDGE;
}

/** Whether a join at a saved store pays today, given this week's count. */
export function attendancePays(attendedThisWeek: number): boolean {
  return attendedThisWeek < ATTENDANCE_WEEKLY_CAP;
}

/** Days between two instants, floored, never negative. */
export function ageInDays(createdAt: string, now: number = Date.now()): number {
  const ms = now - Date.parse(createdAt);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / (24 * 60 * 60 * 1000)) : 0;
}

/**
 * The idempotency key for a trade's award.
 *
 * Keyed to the trade and the player rather than the trade alone, because
 * a confirmed trade pays BOTH sides and each side needs its own ledger
 * row. Keyed at all because confirming is retry-safe by design: the
 * second attempt must cost nothing.
 */
export function tradeAwardRef(tradeId: string, playerId: string): string {
  return `trade:${tradeId}:${playerId}`;
}

/** The key that takes a trade's award back: one reversal per award. */
export function tradeReversalRef(tradeId: string, playerId: string): string {
  return `reversal:trade:${tradeId}:${playerId}`;
}

/** The key for one day's attendance at one store. */
export function attendanceRef(playerId: string, storeId: string, day: string): string {
  return `attend:${playerId}:${storeId}:${day}`;
}

/** The idempotency key for buying one cosmetic once. */
export function purchaseRef(playerId: string, slug: string): string {
  return `purchase:${playerId}:${slug}`;
}

/**
 * The badge's tiers.
 *
 * A raw lifetime number is hard to read across a table: 40 and 400 look
 * the same at a glance in a roster row. A name does not. These are
 * deliberately reachable — the first is one good night — because a
 * status ladder whose bottom rung takes a month is a ladder nobody
 * starts climbing.
 */
export const EMBER_TIERS = [
  { at: 0, name: "Spark" },
  { at: 50, name: "Kindling" },
  { at: 200, name: "Blaze" },
  { at: 600, name: "Wildfire" },
  { at: 1500, name: "Inferno" },
] as const;

export type EmberTier = (typeof EMBER_TIERS)[number]["name"];

/** The tier a lifetime total sits in. */
export function emberTier(earned: number): EmberTier {
  let tier: EmberTier = EMBER_TIERS[0].name;
  for (const step of EMBER_TIERS) {
    if (earned >= step.at) tier = step.name;
  }
  return tier;
}

/** How many more Embers to the next tier, or null at the top. */
export function toNextTier(earned: number): { name: EmberTier; needed: number } | null {
  const next = EMBER_TIERS.find((step) => earned < step.at);
  return next ? { name: next.name, needed: next.at - earned } : null;
}
