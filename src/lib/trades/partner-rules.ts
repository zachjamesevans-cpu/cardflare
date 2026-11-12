/**
 * "Traded with 7 players": the one line on a profile that says whether
 * somebody actually trades.
 *
 * A profile counted Flares, followers and following, and none of those
 * is the thing a stranger wants to know before walking over. PRODUCT.md
 * parks a full standing score and says why a raw trade count will not
 * do: "farmable by two friends confirming each other all afternoon".
 * So this counts PEOPLE, not trades. Two friends confirming each other
 * forty times are one partner each.
 *
 * And only trades both sides said yes to: acknowledged by the other
 * person, and not disputed since. A trade one side wrote down alone is
 * that side's word.
 *
 * Pure: no server in it, every rule unit-tested, and the app's copy of
 * the line is held to this one by a parity test.
 */

/** As much of a trade row as the count needs. */
export interface PartnerTradeRow {
  requester_player_id: string | null;
  holder_player_id: string | null;
  requester_session_id: string | null;
  holder_session_id: string | null;
  acknowledged_at: string | null;
  disputed_at: string | null;
}

/**
 * How many different accounts this player has completed a trade with.
 *
 * `accountOf` maps a room session to its account, for trades written in
 * a room, which name sessions rather than accounts. A guest has no
 * account and is not counted: a guest is a new stranger every time they
 * scan in, which is exactly the farm the count exists to resist.
 */
export function countTradePartners(
  rows: readonly PartnerTradeRow[],
  playerId: string,
  accountOf: ReadonlyMap<string, string>,
): number {
  const account = (player: string | null, session: string | null) =>
    player ?? (session ? (accountOf.get(session) ?? null) : null);

  const partners = new Set<string>();
  for (const row of rows) {
    if (!row.acknowledged_at || row.disputed_at) continue;
    const requester = account(row.requester_player_id, row.requester_session_id);
    const holder = account(row.holder_player_id, row.holder_session_id);
    if (!requester || !holder || requester === holder) continue;
    if (requester === playerId) partners.add(holder);
    else if (holder === playerId) partners.add(requester);
  }
  return partners.size;
}

/** The line itself, or null when there is nothing to say yet. */
export function tradePartnersLine(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  const whole = Math.floor(count);
  return whole === 1 ? "Traded with 1 player" : `Traded with ${whole} players`;
}
