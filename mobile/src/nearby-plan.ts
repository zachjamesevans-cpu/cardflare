/**
 * The Nearby tab, rebuilt as "what is happening around me".
 *
 * The founder: "the nearby screen needs an overhaul", then "let's bring
 * back nearby as a kinda flares near me vibe". It was two near-identical
 * "Walk in any time / The counter code is always open" cards per store
 * you follow, open rooms from anywhere, and the ask for your location
 * at the very bottom. Now, top to bottom:
 *
 *   - where it is looking, and how far ("Near you · 50 mi"), the reach a
 *     tap away - or the ask for a location, first, when there is none
 *   - people near you who want something you have
 *   - Flares near you: posts by people around you, as posts
 *   - the stores, as one row of small tiles you swipe, the ones you
 *     follow first with "Open now" or the next night on them
 *   - nights coming up, with Going
 *
 * `planNearby` decides the order from the Feed's own items, so this
 * works with what the server already sends; the posts arrive once the
 * server files them under "around".
 */

/*
 * Only the fields this reads, written out here rather than imported from
 * api.ts: tests load this file under the website's build, which cannot
 * pull in the app's api module (see tests/unit/mobile-imports.test.ts).
 * The Feed's items fit these shapes; `planNearby` hands them back as
 * they came.
 */
interface BoardFields {
  kind: "board";
  code: string;
  storeName: string;
  yours: boolean;
  live: boolean;
  startsAt: string | null;
  timeZone: string;
}
interface UpcomingFields {
  kind: "upcoming";
  storeId: string;
  storeName: string;
  joinCode: string;
  nextEventAt: string | null;
  nextEventCode: string | null;
  timeZone: string;
  walkIn: boolean;
  /** You said you are going: the night leads "Coming up". */
  youGoing?: boolean;
}
interface NearbyStoresFields {
  kind: "nearbyStores";
  stores: { storeId: string; name: string; miles: number }[];
  needsLocation?: boolean;
}

export interface StoreTile {
  key: string;
  name: string;
  /** "Open now", "Fri 7 PM", "Walk-in", "3 mi". */
  status: string;
  live: boolean;
  /** A store page to open, or a room code to walk into. */
  storeId: string | null;
  code: string | null;
}

export interface NearbyPlan<Item> {
  /** The location ask, when the server does not know where you are. */
  ask: Item | null;
  /** Before the store row: who needs your cards, and posts near you. */
  before: Item[];
  /** After it: nights coming up, and anything this plan does not place. */
  after: Item[];
  stores: StoreTile[];
}

/** "Fri 7 PM" in the store's own clock. */
function shortWhen(at: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      hour: "numeric",
      timeZone,
    }).format(new Date(at));
  } catch {
    return "Soon";
  }
}

export function planNearby<Item extends { kind: string }>(
  items: readonly Item[],
): NearbyPlan<Item> {
  let ask: Item | null = null;
  const lead: Item[] = [];
  const around: Item[] = [];
  const going: Item[] = [];
  const nights: Item[] = [];
  const after: Item[] = [];
  const stores: StoreTile[] = [];
  const seen = new Set<string>();
  const addStore = (tile: StoreTile) => {
    const key = tile.storeId ?? tile.code ?? tile.name;
    if (seen.has(key)) return;
    seen.add(key);
    stores.push(tile);
  };

  for (const item of items) {
    switch (item.kind) {
      case "nearbyMatch":
      case "wanted":
        lead.push(item);
        break;
      case "hunt":
        around.push(item);
        break;
      case "board": {
        const board = item as unknown as BoardFields;
        /* A room open at one of your stores is a tile that says so. A
           room open somewhere far away is not news about near you. */
        if (board.yours) {
          addStore({
            key: `board-${board.code}`,
            name: board.storeName,
            status: board.live
              ? "Open now"
              : board.startsAt
                ? shortWhen(board.startsAt, board.timeZone)
                : "Taking Flares",
            live: board.live,
            storeId: null,
            code: board.code,
          });
        }
        break;
      }
      case "upcoming": {
        const upcoming = item as unknown as UpcomingFields;
        addStore({
          key: `upcoming-${upcoming.storeId}`,
          name: upcoming.storeName,
          status: upcoming.nextEventAt
            ? shortWhen(upcoming.nextEventAt, upcoming.timeZone)
            : upcoming.walkIn
              ? "Walk-in"
              : "No night set",
          live: false,
          storeId: upcoming.storeId,
          code: upcoming.nextEventCode ?? upcoming.joinCode,
        });
        /* A night on the calendar keeps its card, with Going on it; a
           store that only takes walk-ins is just its tile now. The
           nights you said you are going to lead, as the Rooms tab's
           Going list did before Nearby took its slot. */
        if (upcoming.nextEventAt) (upcoming.youGoing ? going : nights).push(item);
        break;
      }
      case "nearbyStores": {
        const near = item as unknown as NearbyStoresFields;
        if (near.needsLocation) {
          ask = item;
          break;
        }
        for (const store of near.stores) {
          addStore({
            key: `near-${store.storeId}`,
            name: store.name,
            status: `${store.miles < 1 ? "<1" : Math.round(store.miles)} mi`,
            live: false,
            storeId: store.storeId,
            code: null,
          });
        }
        /* No stores near a known place: the card says so, below. */
        if (near.stores.length === 0) after.push(item);
        break;
      }
      default:
        after.push(item);
    }
  }

  return {
    ask,
    before: [...lead, ...around],
    after: [...going, ...nights, ...after],
    stores,
  };
}
