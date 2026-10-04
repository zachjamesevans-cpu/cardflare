/**
 * The words on a Night, shared by every surface that draws one.
 *
 * Plain on purpose: no server-only import, so client components and
 * the parity test can read it. `mobile/src/night-copy.ts` is the app's
 * copy, word for word, and tests/unit/nights2-parity.test.ts holds the
 * two together.
 *
 * The founder: "The most valuable information is NOT 'Who is
 * attending?' The most valuable information is 'Who can I trade with
 * and why?'" So the lines here are about matches first and attendance
 * once.
 */

export const NIGHT_TABS = { going: "Going", nearby: "Nearby", past: "Past" } as const;
export const SCAN_QR = "Scan QR";
export const ENTER_CODE = "Enter event code";
export const GOING_EMPTY =
  "You're not going to anything yet. Nearby has what's coming up.";
export const PAST_EMPTY = "Nothing yet. Nights you went to land here.";
export const BOARD_EARLY = "Board open early";
export const BOARD_EARLY_LINE = "Post now so players know what to bring.";
export const BOARD_EARLY_LONG =
  "Everyone here is still on their way. Post what you're looking for now, so people know what to bring from home. Flares from players who never make it are cleared when the event ends.";
export const MATCHES_FOR_YOU = "Matches for you";
export const SEE_ALL_MATCHES = "See all matches";
export const NO_MATCHES =
  "No matches yet. Post a Flare or add to your Trade binder and Cardflare keeps looking.";
export const MUTUAL_MATCH = "Mutual match";
export const YOU_WANT = "You want";
export const THEY_WANT = "They want";
export const THEY_HAVE = "They have";
export const MUTUAL_LINE = "You may already have the pieces for a trade.";
export const THEY_HAVE_WHAT_YOU_WANT = "They have what you want";
export const THEY_WANT_WHAT_YOU_HAVE = "They want what you have";
export const FROM_YOUR_FLARE = "You posted a Flare for this";
export const IN_YOUR_BINDER = "In your Trade binder";
/**
 * Under a matched card whose printing is not the one the wanter named:
 * THEY on cards they have that you want, YOU on cards they want that
 * you have. The second phrase is `youHaveLabel`'s, word for word.
 */
export const OTHER_PRINTING_THEY = "They have another printing";
export const OTHER_PRINTING_YOU = "You have another printing";
/** The same fact under a thumbnail, where the column heading already says whose. */
export const OTHER_PRINTING_SHORT = "Other printing";
export const WHAT_TO_BRING = "What to bring";
export const PACKED = "Packed";
export const VIEW_LIST = "View list";
export const FLARES_AT_THIS_NIGHT = "Flares at this Night";
export const FLARE_FILTERS = {
  all: "All",
  hunting: "Hunting",
  offering: "Offering",
} as const;
export const PLAYERS_GOING = "Players going";
export const EVENT_DETAILS = "Event details";
export const POST_A_FLARE = "Post a Flare";
export const ACTIVE_FLARES = "Active Flares";
export const TRADE_BINDERS = "Trade binders";

/** The store's cancel confirm, by who has joined. */
export const CANCEL_EMPTY =
  "Nobody has joined yet, so this night will be removed. Cancel it?";
export const CANCEL_JOINED = "Players who joined will see it closed. Cancel it?";

/** "Nobody yet", "1 player", "18 players". */
export function playersLine(n: number): string {
  if (n <= 0) return "Nobody yet";
  return n === 1 ? "1 player" : `${n} players`;
}

/** "3 here now". */
export function hereNowLine(n: number): string {
  return `${n} here now`;
}

/** "1 match", "6 matches". */
export function matchesLine(n: number): string {
  return n === 1 ? "1 match" : `${n} matches`;
}

/** "1 match for you", "7 matches for you". */
export function matchesForYouLine(n: number): string {
  return n === 1 ? "1 match for you" : `${n} matches for you`;
}

/** "1 card you're hunting is here", "4 cards you're hunting are here". */
export function huntingHereLine(n: number): string {
  return n === 1
    ? "1 card you're hunting is here"
    : `${n} cards you're hunting are here`;
}

/** "1 player wants cards you have", "3 players want cards you have". */
export function wantYoursLine(n: number): string {
  return n === 1 ? "1 player wants cards you have" : `${n} players want cards you have`;
}

/** "Players at this Night are looking for 5 cards you own." */
export function bringLine(n: number): string {
  return `Players at this Night are looking for ${n === 1 ? "1 card" : `${n} cards`} you own.`;
}

/** "Wanted by CHUNC", "Wanted by Alex + 1 other", "Wanted by Alex + 2 others". */
export function wantedByLine(names: string[]): string {
  const [first, ...rest] = names;
  if (!first) return "Wanted by a player";
  if (rest.length === 0) return `Wanted by ${first}`;
  return `Wanted by ${first} + ${rest.length} ${rest.length === 1 ? "other" : "others"}`;
}

/** "1 match with you", "2 matches with you". */
export function matchesWithYouLine(n: number): string {
  return n === 1 ? "1 match with you" : `${n} matches with you`;
}

/** "1 Flare", "9 Flares". */
export function flaresLine(n: number): string {
  return n === 1 ? "1 Flare" : `${n} Flares`;
}

/** "1 trade card", "42 trade cards". */
export function tradeCardsLine(n: number): string {
  return n === 1 ? "1 trade card" : `${n} trade cards`;
}
