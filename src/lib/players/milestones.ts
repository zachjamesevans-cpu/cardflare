import "server-only";

import { shopSeries } from "@/lib/packs/catalog";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

import { awardEmbers } from "./embers";
import { huntsFor } from "./hunts";
import {
  TIER_PACKS,
  milestoneRef,
  progressOf,
  tierPackRef,
  tiersReached,
  type MilestoneFacts,
  type MilestoneProgress,
} from "./milestone-rules";

/**
 * Milestones, the database side: count what a player has done, pay any
 * milestone newly reached, and hand over a pack for each badge tier. The
 * rules are milestone-rules.ts.
 *
 * Idempotent by construction: every payment carries a ref the ledger (or
 * player_packs) will only ever take once, so this can run on every visit
 * to the shop and after every trade without paying twice.
 */

const EMPTY: MilestoneFacts = {
  flares: 0,
  trades: 0,
  partners: 0,
  huntsFinished: 0,
  storeVisits: 0,
};

/** What a player has done, counted from the records themselves. */
export async function milestoneFacts(playerId: string): Promise<MilestoneFacts> {
  if (!isSupabaseConfigured()) return EMPTY;
  const admin = getSupabaseAdmin();

  const [{ count: flares }, { data: sessions }, { count: visits }, hunts] =
    await Promise.all([
      admin
        .from("flare_posts")
        .select("id", { count: "exact", head: true })
        .eq("player_id", playerId),
      admin.from("player_sessions").select("id").eq("player_id", playerId),
      admin
        .from("ember_ledger")
        .select("id", { count: "exact", head: true })
        .eq("player_id", playerId)
        .eq("reason", "attendance"),
      huntsFor(playerId, playerId),
    ]);

  /* Trades: a conversation trade names accounts, a room trade names
     sessions; either side may be this player. Paid, never disputed. */
  const mine = new Set((sessions ?? []).map((row) => row.id));
  const columns =
    "id, requester_player_id, holder_player_id, requester_session_id, holder_session_id, paid_at, disputed_at";
  const byAccount = admin
    .from("trades")
    .select(columns)
    .or(`requester_player_id.eq.${playerId},holder_player_id.eq.${playerId}`);
  const bySession =
    mine.size > 0
      ? admin
          .from("trades")
          .select(columns)
          .or(
            `requester_session_id.in.(${[...mine].join(",")}),holder_session_id.in.(${[...mine].join(",")})`,
          )
      : null;
  const [{ data: accountTrades }, sessionResult] = await Promise.all([
    byAccount,
    bySession ?? Promise.resolve({ data: [] as never[] }),
  ]);

  const trades = new Map<string, NonNullable<typeof accountTrades>[number]>();
  for (const trade of [...(accountTrades ?? []), ...(sessionResult.data ?? [])]) {
    if (trade.paid_at && !trade.disputed_at) trades.set(trade.id, trade);
  }

  /* The other side of each, as an account where one can be found. */
  const otherSessions = new Set<string>();
  const partners = new Set<string>();
  for (const trade of trades.values()) {
    const iAmRequester =
      trade.requester_player_id === playerId ||
      (trade.requester_session_id !== null && mine.has(trade.requester_session_id));
    const otherPlayer = iAmRequester
      ? trade.holder_player_id
      : trade.requester_player_id;
    const otherSession = iAmRequester
      ? trade.holder_session_id
      : trade.requester_session_id;
    if (otherPlayer && otherPlayer !== playerId) partners.add(otherPlayer);
    else if (otherSession && !mine.has(otherSession)) otherSessions.add(otherSession);
  }
  if (otherSessions.size > 0) {
    const { data: owners } = await admin
      .from("player_sessions")
      .select("player_id")
      .in("id", [...otherSessions]);
    for (const owner of owners ?? []) {
      if (owner.player_id && owner.player_id !== playerId)
        partners.add(owner.player_id);
    }
  }

  const huntsFinished = hunts.filter(
    (hunt) => hunt.looking === 0 && hunt.found >= 3,
  ).length;

  return {
    flares: flares ?? 0,
    trades: trades.size,
    partners: partners.size,
    huntsFinished,
    storeVisits: visits ?? 0,
  };
}

export interface MilestoneBoard {
  milestones: MilestoneProgress[];
  tiers: { tier: string; earned: number; reached: boolean }[];
  /** Lifetime Embers, the badge's own number. */
  earned: number;
}

/**
 * Pay anything newly reached, then report where the player stands.
 * Never throws: a failed check leaves the board as it was read.
 */
export async function checkMilestones(playerId: string): Promise<MilestoneBoard> {
  const facts = await milestoneFacts(playerId).catch(() => EMPTY);
  const milestones = progressOf(facts);

  if (isSupabaseConfigured()) {
    for (const milestone of milestones.filter((entry) => entry.done)) {
      await awardEmbers(
        playerId,
        milestone.embers,
        "milestone",
        milestoneRef(playerId, milestone.key),
        milestone.title,
      ).catch(() => false);
    }
  }

  const earned = await lifetimeEmbers(playerId);
  await grantTierPacks(playerId, earned);

  return {
    milestones,
    tiers: TIER_PACKS.map((step) => ({ ...step, reached: earned >= step.earned })),
    earned,
  };
}

/** The badge's number: lifetime Embers, less anything a dispute took. */
async function lifetimeEmbers(playerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("embers_badge, embers_earned")
    .eq("id", playerId)
    .maybeSingle();
  return data?.embers_badge ?? data?.embers_earned ?? 0;
}

/**
 * A sealed pack for each badge tier reached, once each: the newest pack
 * on sale, the way the shop leads. The unique ref on player_packs turns
 * a second grant of the same tier into a no-op.
 */
async function grantTierPacks(playerId: string, earned: number): Promise<void> {
  const reached = tiersReached(earned);
  if (reached.length === 0 || !isSupabaseConfigured()) return;

  const [newest] = await shopSeries();
  if (!newest) return;

  const admin = getSupabaseAdmin();
  for (const tier of reached) {
    const { error } = await admin.from("player_packs").insert({
      player_id: playerId,
      series: newest.id,
      source: "milestone",
      ref: tierPackRef(playerId, tier),
    });
    /* 23505 is the ref already taken: the tier paid before. */
    if (error && error.code !== "23505") {
      console.error("Could not grant a tier pack", error);
    }
  }
}
