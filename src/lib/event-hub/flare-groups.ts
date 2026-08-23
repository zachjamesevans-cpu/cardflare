import type { DisplayFlare } from "./display-payload";

/**
 * Whose card is whose, on the wall.
 *
 * The board used to be a flat list of cards, and with several people
 * hunting it read as one undifferentiated strip — the founder, from a
 * live shop: "if people have multiple flares posted on that bottom bar,
 * there should be a divider between two different people's flares."
 *
 * So a card belongs to a GROUP, and a group is a person. Saying
 * "Savannah is looking for" once above her two cards is both less ink
 * and faster to read across a room than printing her name on every
 * card, and it makes the thing a shop actually cares about visible at a
 * glance: who in this room wants something.
 *
 * Pure, and separate from the component, because the interesting part
 * is the grouping rule rather than the markup.
 */

/** One person's cards on the board. */
export interface FlareGroup {
  /** Stable across renders, so React can keep the DOM. */
  key: string;
  /** Who is asking: a name, or a count when it is more than one. */
  who: string;
  /** Agrees with `who`. "is looking for" / "are looking for". */
  verb: string;
  flares: DisplayFlare[];
}

/**
 * Which group a card belongs to.
 *
 * A card wanted by ONE person groups under that person. A card wanted
 * by several belongs to no one in particular, so it stands alone —
 * "3 people are looking for this" is a fact about the card, not about a
 * person, and folding those together under a shared heading would claim
 * the same three people wanted all of them.
 */
export function flareGroupKey(flare: DisplayFlare): string {
  if (flare.people > 1) return `shared:${flare.cardId}`;
  if (flare.askedBy) return `player:${flare.askedBy}`;
  /* A guest who never gave a name still posted something real. */
  return `anon:${flare.cardId}`;
}

/** The heading over a group, as the two halves the board styles apart. */
export function flareGroupHeading(flare: DisplayFlare): {
  who: string;
  verb: string;
} {
  if (flare.people > 1) {
    return { who: `${flare.people} people`, verb: "are looking for" };
  }
  if (flare.askedBy) return { who: flare.askedBy, verb: "is looking for" };
  return { who: "Somebody", verb: "is looking for" };
}

/**
 * The board's cards, with one person's cards next to each other.
 *
 * Applied BEFORE the rotation windows the list, and that ordering is the
 * whole reason this exists as a separate step: the window takes a slice
 * of a few cards, so if a person's two cards sit at opposite ends of the
 * list they land in different windows and the grouping never gets to
 * happen. Sorting first means a window usually holds whole groups.
 *
 * Stable by first appearance, so the board does not reshuffle itself
 * between polls while somebody is reading it.
 */
export function orderByAsker(flares: readonly DisplayFlare[]): DisplayFlare[] {
  const order = new Map<string, number>();

  for (const flare of flares) {
    const key = flareGroupKey(flare);
    if (!order.has(key)) order.set(key, order.size);
  }

  return [...flares].sort(
    (a, b) => order.get(flareGroupKey(a))! - order.get(flareGroupKey(b))!,
  );
}

/**
 * The visible cards, gathered into their groups.
 *
 * Takes what is already on screen rather than the whole board, so the
 * headings describe what a person can actually see. Adjacent cards with
 * the same key join; a key that reappears after somebody else's cards
 * starts a second group rather than reaching backwards, because a
 * heading has to sit above its own cards.
 */
export function groupFlares(flares: readonly DisplayFlare[]): FlareGroup[] {
  const groups: FlareGroup[] = [];
  /*
   * The RAW key, kept beside the list rather than read back off the last
   * group. The group's own `key` carries an index for React, so
   * comparing against it never matches and every card becomes its own
   * group - which renders as the same person's name printed twice in a
   * row, above one card each. Caught by looking at it.
   */
  let openKey: string | null = null;

  for (const flare of flares) {
    const key = flareGroupKey(flare);

    if (openKey === key && groups.length > 0) {
      groups[groups.length - 1].flares.push(flare);
      continue;
    }

    openKey = key;
    groups.push({
      /* The index disambiguates a person whose cards were split across
         the window by somebody else's; both headings are correct. */
      key: `${key}#${groups.length}`,
      ...flareGroupHeading(flare),
      flares: [flare],
    });
  }

  return groups;
}
