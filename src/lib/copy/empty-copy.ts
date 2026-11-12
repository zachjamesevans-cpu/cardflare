/**
 * What an empty place says: the words under Search, the Inbox and a
 * store's page when there is nothing to list.
 *
 * Each one is a short line that says what is true and, where a real
 * next step exists, one door to it that already works. The app's copy
 * is mobile/src/empty-copy.ts, word for word, and
 * tests/unit/empty-copy-parity.test.ts holds the two together.
 */

/* SEARCH: nothing matched, by the tab that is open. */

export type SearchEmptyTab = "top" | "players" | "cards" | "stores";

/** What is true: nothing of this kind matched. */
export const SEARCH_EMPTY: Record<SearchEmptyTab, string> = {
  top: "Nothing matched that.",
  players: "No players matched that.",
  cards: "No cards matched that.",
  stores: "No stores matched that.",
};

/** What the field can really do next. Each is a search that works. */
export const SEARCH_EMPTY_HINT: Record<SearchEmptyTab, string> = {
  top: "Try a card number like OP01-001, a player's @username or a store's name.",
  players: "Check the spelling of their name or username.",
  cards: "Try the card number, like OP01-001.",
  stores: "Try the store's name or its city.",
};

/** The one button: back to Top, where the kinds that did match are. */
export const SEARCH_EMPTY_SEE_TOP = "See all results";

const SEARCH_KINDS = ["players", "cards", "stores"] as const;

/**
 * The empty state under a tab: the line, the hint, and the button's
 * label when another kind has rows (null when there is nowhere to go).
 * On Top, or when nothing matched anywhere, the hint is how to search;
 * on a kind's tab with other kinds matched, it names them: "Cards and
 * stores did."
 */
export function searchEmpty(
  tab: SearchEmptyTab,
  counts: { players: number; cards: number; stores: number },
): { line: string; hint: string; action: string | null } {
  const others =
    tab === "top"
      ? []
      : SEARCH_KINDS.filter((kind) => kind !== tab && counts[kind] > 0);
  if (others.length === 0) {
    return { line: SEARCH_EMPTY[tab], hint: SEARCH_EMPTY_HINT[tab], action: null };
  }
  const names = others.join(" and ");
  return {
    line: SEARCH_EMPTY[tab],
    hint: `${names.charAt(0).toUpperCase()}${names.slice(1)} did.`,
    action: SEARCH_EMPTY_SEE_TOP,
  };
}

/* THE INBOX: no notices yet. Every kind named here is one the server
   really sends (src/lib/notifications/notify.ts): an offer on a Flare,
   a comment on a Flare post, a new follower, a nearby match. Posting a
   Flare is what the first two answer, so that is the button. */

export const INBOX_EMPTY = "No notifications yet.";
export const INBOX_EMPTY_HINT =
  "Offers and comments on your Flares, new followers and players near you who want your cards land here.";
export const INBOX_EMPTY_ACTION = "Post a Flare";

/* A STORE'S PAGE: a claimed store with no nights booked. The Follow
   button is already on the page, above the nights, so the line points
   at it and no second button is drawn. */

export const STORE_NIGHTS_EMPTY = "Nothing scheduled yet.";
export const STORE_NIGHTS_EMPTY_FOLLOW =
  "Follow the store above and its next night shows up in your Feed.";
export const STORE_NIGHTS_EMPTY_FOLLOWING =
  "You follow this store, so its next night shows up in your Feed.";

/** The second line under "Nothing scheduled yet.", by whether the viewer follows. */
export function storeNightsEmptyHint(following: boolean): string {
  return following ? STORE_NIGHTS_EMPTY_FOLLOWING : STORE_NIGHTS_EMPTY_FOLLOW;
}

/* YOUR BINDERS: none yet. "New binder" is the button right above the
   line on both platforms, so the line says what a binder is for and
   what filling one takes, and no second button is drawn. This is also
   where the intro's "Add a binder" lands a new player. */

export const BINDERS_EMPTY = "No binders yet.";
export const BINDERS_EMPTY_HINT =
  "Start one for the cards you would trade. Scan its pages or add cards by name.";
