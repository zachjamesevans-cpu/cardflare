import "server-only";

import { cardFacts } from "@/lib/feed/repository";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { tierAllows } from "@/lib/tiers";

/**
 * A HUNT: a named set of cards somebody is looking for.
 *
 * The founder: "a way for someone to go onto someone's profile and see
 * their flare groups... so someone can say, paste a deck list, then
 * check off the cards somehow. like I can go to someone's proifle and
 * they can have a section for their flaregroups with cards they already
 * found, and cards they're still looking for."
 *
 * NOTHING NEW IS STORED. A hunt is the `deck_label` that Flares have
 * carried since batches arrived - the composer already asks for one
 * ("Every card you post from here joins this group") and the Feed
 * already draws a deck as one post because of it. What was missing was
 * anywhere to SEE the set once it was posted, and any sense of progress
 * through it.
 *
 * Progress is the flare's own status, not a second thing to keep in
 * step: `open` is still looking, `traded` is found. So a card is checked
 * off by the trade that got it, which is the one moment we can be sure
 * actually happened, rather than by remembering to tick a box.
 */
export interface HuntCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** Traded: checked off by the trade that got it. */
  found: boolean;
  /** How many of it they are after. */
  quantity: number;
}

export interface Hunt {
  /** The name they typed: "Sabo", "Red Luffy". */
  name: string;
  /** Cards still open, and how many copies across them. */
  looking: number;
  lookingCopies: number;
  /** Cards that have since traded. */
  found: number;
  /** The most recent post in the hunt, for ordering. */
  lastPostedAt: string;
  /**
   * THE CARDS THEMSELVES, still looking first.
   *
   * A hunt used to be a name and two numbers, and the founder went
   * looking for the rest of it: "hunts doesn't really do anything rn...
   * this should be a carousel of cards someone is looking for nested
   * into a folder. go to my profile. there's nothing i can tap or add
   * to."
   *
   * Right - two numbers is a receipt, not a folder. What somebody wants
   * from a hunt is the same thing they want from a Flare: to see the
   * cards. So the set travels with its counts, drawn by the same rail
   * the Feed already uses, and the numbers become a summary of
   * something visible rather than a substitute for it.
   */
  cards: HuntCard[];
}

/**
 * How many hunts a player may keep at once.
 *
 * The founder: "free users can do two flare groups... pro players get 50
 * of these." Two is enough to prove the idea - a deck you are building
 * and the loose chase cards beside it - and fifty is past the point
 * where the number is what stops anybody.
 */
export const HUNT_LIMIT = { free: 2, pro: 50 } as const;

export function huntLimitFor(tier: string | null): number {
  return tierAllows(tier, "moreHunts") ? HUNT_LIMIT.pro : HUNT_LIMIT.free;
}

/**
 * Every named hunt a player has, newest first.
 *
 * One read. A player with fifty hunts and a thousand Flares is still one
 * query and a fold, because the alternative - a query per hunt - is the
 * shape that makes a profile arrive late on a shop's wifi.
 *
 * Flares with no name are not a hunt. A single card posted on its own is
 * a Flare and shows as one; it does not need a folder of its own, and
 * counting it as one would make everybody's profile claim hunts they
 * never started.
 */
export async function huntsFor(playerId: string): Promise<Hunt[]> {
  const { data } = await getSupabaseAdmin()
    .from("flares")
    .select("deck_label, status, quantity, created_at, card_id")
    .eq("player_id", playerId)
    .not("deck_label", "is", null)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) return [];

  /* One lookup for every card in every hunt, rather than one per hunt.
     A player with fifty folders is still two queries and a fold. */
  const facts = await cardFacts(data.map((row) => row.card_id));

  const byName = new Map<string, Hunt>();

  for (const row of data) {
    const name = row.deck_label?.trim();
    if (!name) continue;

    const hunt = byName.get(name) ?? {
      name,
      looking: 0,
      lookingCopies: 0,
      found: 0,
      /* Rows arrive newest first, so the first one seen is the latest. */
      lastPostedAt: row.created_at,
      cards: [],
    };

    const found = row.status === "traded";
    if (found) hunt.found += 1;
    else {
      hunt.looking += 1;
      hunt.lookingCopies += row.quantity ?? 1;
    }

    /* A card with no facts is one the catalogue has since dropped. It
       still counts - the flare happened - but there is nothing to draw,
       and a tile with no name is worse than one fewer tile. */
    const fact = facts.get(row.card_id);
    if (fact) {
      hunt.cards.push({
        cardId: row.card_id,
        cardName: fact.cardName,
        cardNumber: fact.cardNumber,
        imageUrl: fact.imageUrl,
        found,
        quantity: row.quantity ?? 1,
      });
    }

    byName.set(name, hunt);
  }

  for (const hunt of byName.values()) {
    /*
     * ONE TILE PER CARD, not per Flare. Posting the same card into a
     * hunt twice is ordinary - a second copy wanted, or a repost - and
     * it used to mean two tiles with the same React key, which is the
     * exact duplicate-key fault the Feed had to be fixed for. A card
     * still wanted beats the same card already found: the copy you can
     * help with is the one worth drawing.
     */
    const byCard = new Map<string, HuntCard>();
    for (const card of hunt.cards) {
      const seen = byCard.get(card.cardId);
      if (!seen) byCard.set(card.cardId, card);
      else if (seen.found && !card.found) byCard.set(card.cardId, card);
      else if (seen.found === card.found) seen.quantity += card.quantity;
    }
    /* Still looking first: the folder is about what is left, and a run
       of found cards at the front buries the part somebody can help
       with. */
    hunt.cards = [...byCard.values()].sort((a, b) => Number(a.found) - Number(b.found));
  }

  return [...byName.values()];
}

/**
 * Whether a player may start a hunt by this name.
 *
 * Adding to one they already have is always allowed - the limit is on
 * how many sets they keep, not on how many cards go in them. A hunt that
 * is entirely found still counts: it is theirs, it is on their profile,
 * and quietly letting a finished one be replaced would lose it.
 */
export async function canStartHunt(
  playerId: string,
  name: string,
): Promise<{ allowed: boolean; kept: number; limit: number }> {
  /* Read here rather than passed in: a caller that has to fetch the tier
     first is a caller that can forget to, and get a free player fifty. */
  const { data: player } = await getSupabaseAdmin()
    .from("players")
    .select("tier")
    .eq("id", playerId)
    .maybeSingle();

  const limit = huntLimitFor(player?.tier ?? null);
  const hunts = await huntsFor(playerId);
  const wanted = name.trim().toLowerCase();

  const already = hunts.some((hunt) => hunt.name.toLowerCase() === wanted);

  return {
    allowed: already || hunts.length < limit,
    kept: hunts.length,
    limit,
  };
}
