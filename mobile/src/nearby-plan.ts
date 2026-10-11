/**
 * The Nearby tab: a standing trade room for your area.
 *
 * The founder: "let's bring back nearby as a kinda flares near me
 * vibe", then "i think the nearby thing should solely be used as a
 * persistent nearby trade room, in a way, before anything else" - and
 * the store discovery (a row of shops, the nights coming up) waits for
 * a later build, "once we have more stores adopted". So Nearby keeps
 * only what is a trade:
 *
 *   - the ask for a location, first, when the server has none: nothing
 *     else here works without it
 *   - people who want a card you hold, and Flares you can answer
 *   - Flares near you: posts by people around you whom you do not
 *     follow, as posts, in whichever view the Feed is set to
 *
 * Everything else the server files under Nearby - rooms, nights, the
 * stores-near-you list, "plan a visit" - is left out here, not deleted:
 * the Rooms screen still has the nights, and the server still sends
 * the rest for when store discovery comes back.
 */

/* The server's "we do not know where you are" item. Only the field this
   reads, written out rather than imported from api.ts: tests load this
   file under the website's build (see tests/unit/mobile-imports.test.ts). */
interface NearbyStoresFields {
  kind: "nearbyStores";
  needsLocation?: boolean;
}

export interface NearbyPlan<Item> {
  /** The location ask, when the server does not know where you are. */
  ask: Item | null;
  /** Who wants your cards, then Flares near you, in that order. */
  items: Item[];
  /** How many of `items` are posts near you: none draws the empty room. */
  posts: number;
}

export function planNearby<Item extends { kind: string }>(
  items: readonly Item[],
): NearbyPlan<Item> {
  let ask: Item | null = null;
  const wanted: Item[] = [];
  const posts: Item[] = [];

  for (const item of items) {
    switch (item.kind) {
      case "nearbyMatch":
      case "wanted":
        wanted.push(item);
        break;
      case "hunt":
        posts.push(item);
        break;
      case "nearbyStores":
        if ((item as unknown as NearbyStoresFields).needsLocation) ask = item;
        break;
      default:
        /* Store discovery: a later build. */
        break;
    }
  }

  return { ask, items: [...wanted, ...posts], posts: posts.length };
}
