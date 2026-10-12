/**
 * Milestones: one-off rewards for doing what cardflare is for.
 *
 * From the Embers review (2026-10-11), step 4. Earning came almost only
 * from trades and the badge tiers unlocked nothing; a new player had a
 * long, quiet road to anything. Each milestone pays Embers ONCE, for a
 * thing that is hard to fake - a trade the other person confirmed, a
 * hunt finished, turning up at a store you saved - and each badge tier
 * reached hands over a sealed pack.
 *
 * Pure: the numbers a player has reached in, which milestones they have
 * met out. The database side is milestones.ts.
 */

export interface MilestoneFacts {
  /** Flares posted, ever. */
  flares: number;
  /** Trades confirmed and paid, ever. */
  trades: number;
  /** Different people traded with, confirmed. */
  partners: number;
  /** Hunts of three or more cards with every copy found. */
  huntsFinished: number;
  /** Nights turned up at a saved store (attendance Embers paid). */
  storeVisits: number;
}

export interface Milestone {
  key: string;
  title: string;
  /** Which fact it counts, and how far it has to reach. */
  fact: keyof MilestoneFacts;
  goal: number;
  embers: number;
}

export const MILESTONES: Milestone[] = [
  {
    key: "first-flare",
    title: "Post your first Flare",
    fact: "flares",
    goal: 1,
    embers: 15,
  },
  {
    key: "first-trade",
    title: "Complete your first trade",
    fact: "trades",
    goal: 1,
    embers: 25,
  },
  {
    key: "partners-5",
    title: "Trade with 5 different players",
    fact: "partners",
    goal: 5,
    embers: 40,
  },
  {
    key: "partners-10",
    title: "Trade with 10 different players",
    fact: "partners",
    goal: 10,
    embers: 75,
  },
  { key: "hunt-1", title: "Finish a hunt", fact: "huntsFinished", goal: 1, embers: 50 },
  {
    key: "hunt-3",
    title: "Finish 3 hunts",
    fact: "huntsFinished",
    goal: 3,
    embers: 100,
  },
  {
    key: "regular-4",
    title: "Turn up at your store 4 times",
    fact: "storeVisits",
    goal: 4,
    embers: 30,
  },
];

/**
 * The badge tiers that hand over a pack, by lifetime Embers - the same
 * ladder the badge reads (ember-badge: Kindling 50, Blaze 200, Wildfire
 * 600, Inferno 1500). Spark, at 0, is where everybody starts.
 */
export const TIER_PACKS: { tier: string; earned: number }[] = [
  { tier: "Kindling", earned: 50 },
  { tier: "Blaze", earned: 200 },
  { tier: "Wildfire", earned: 600 },
  { tier: "Inferno", earned: 1500 },
];

/** A milestone's ledger ref: one per player per milestone, ever. */
export function milestoneRef(playerId: string, key: string): string {
  return `milestone:${key}:${playerId}`;
}

/** A tier pack's ref on player_packs: one per player per tier, ever. */
export function tierPackRef(playerId: string, tier: string): string {
  return `tier-pack:${tier.toLowerCase()}:${playerId}`;
}

export interface MilestoneProgress extends Milestone {
  progress: number;
  done: boolean;
}

/** Every milestone with how far along it is. */
export function progressOf(facts: MilestoneFacts): MilestoneProgress[] {
  return MILESTONES.map((milestone) => {
    const value = facts[milestone.fact];
    return {
      ...milestone,
      progress: Math.min(value, milestone.goal),
      done: value >= milestone.goal,
    };
  });
}

/** The tiers a lifetime total has reached. */
export function tiersReached(earned: number): string[] {
  return TIER_PACKS.filter((step) => earned >= step.earned).map((step) => step.tier);
}
