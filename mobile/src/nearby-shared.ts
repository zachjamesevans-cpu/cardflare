/**
 * Nearby matching's words, free of server-only imports so both the
 * website's client islands and the unit tests can use them.
 */

/**
 * How far away, said coarsely on purpose.
 *
 * A distance is ZIP centroid to ZIP centroid, which is already miles
 * of slack, and it is rounded again here so a number can never be
 * walked back to a street. Under two miles is "nearby" and nothing
 * finer: the founder's rule is approximate location, preserved.
 */
export function milesLabel(miles: number): string {
  if (miles < 2) return "Under 2 mi away";
  return `About ${Math.round(miles)} mi away`;
}

/**
 * The same distance as a number, no finer than the label: 1 for
 * anything under two miles, whole miles past it. This is what leaves
 * the server, so a client can sort by it but cannot work back from it
 * to the other person's ZIP.
 */
export function roundedMiles(miles: number): number {
  return miles < 2 ? 1 : Math.round(miles);
}

/** The first message "I have this" sends, with or without a place to suggest. */
export function haveThisMessage(storeName: string | null): string {
  return storeName
    ? `I have this one. Want to meet at ${storeName}?`
    : "I have this one. Where do you usually play?";
}

/** The first message "Message <name>" sends: a hello, so the box opens on a thread that exists. */
export function messageOpener(): string {
  return "Hi! I saw you are looking for this.";
}

/**
 * WANTED NEAR YOU: the name of the card and the screen behind it. The
 * founder (2026-10-12), of "You can answer a Flare": "sounds kinda
 * weird verbiage and very internal to us."
 */
export const WANTED_HEADING = "Wanted near you";
export const WANTED_PRIVATE_LINE =
  "Only you see this. They hear from you when you message.";

/**
 * A distance as short as a row can say it: "Under 2 mi", "4 mi". Fed
 * the rounded number the server sends (roundedMiles), so it is no finer
 * than the label.
 */
export function shortMiles(miles: number): string {
  return miles < 2 ? "Under 2 mi" : `${Math.round(miles)} mi`;
}

/** The count under the heading: people, not matches. */
export function wantedCountLine(people: number): string {
  return people === 1
    ? "1 person near you wants a card from your binder"
    : `${people} people near you want cards from your binder`;
}

/** What a reply starts as. A draft: nothing is sent until Send. */
export const ANSWER_DRAFT = "I have this one. Where do you usually play?";

/** A row whose Flare is gone by the time somebody answers it. */
export const ANSWER_GONE = "They found it or took it down.";

/** The phone buzzes for this many matches a day, then once more, then waits. */
export const PUSHES_PER_DAY = 3;
export const DIGEST_TITLE = "More people near you want cards from your binder";
export const DIGEST_BODY = "See who in Wanted near you.";
export const WANTED_PATH = "/feed/wanted";

export type WantedSort = "most" | "closest" | "newest";

export const WANTED_SORTS: { key: WantedSort; label: string }[] = [
  { key: "most", label: "Most wanted" },
  { key: "closest", label: "Closest" },
  { key: "newest", label: "Newest" },
];

export function isWantedSort(value: unknown): value is WantedSort {
  return value === "most" || value === "closest" || value === "newest";
}

/** The least a match has to carry to be grouped. */
export interface GroupableMatch {
  card: { cardId: string };
  wanter: { playerId: string };
  miles: number;
  when: string;
  threadId: string | null;
}

export interface MatchGroup<T extends GroupableMatch> {
  cardId: string;
  people: T[];
  nearest: number;
  newest: string;
}

/**
 * Matches grouped by CARD, not by person. A hundred people in a big
 * city usually want a dozen of your cards, and "which of mine is
 * wanted" is the question; a list of a hundred rows answers nothing.
 * The founder: "in a big city like portland, it's entirely possible
 * that there could be 100+ people looking for those cards."
 *
 * Inside a card: the people not yet messaged first, closest first;
 * those already messaged go to the bottom, so the top is what is left
 * to do. Cards in the order asked for.
 */
export function groupByCard<T extends GroupableMatch>(
  matches: T[],
  sort: WantedSort,
): MatchGroup<T>[] {
  const byCard = new Map<string, T[]>();
  for (const match of matches) {
    const list = byCard.get(match.card.cardId) ?? [];
    list.push(match);
    byCard.set(match.card.cardId, list);
  }

  const groups = [...byCard.entries()].map(([cardId, people]) => {
    const sorted = [...people].sort(
      (a, b) =>
        Number(Boolean(a.threadId)) - Number(Boolean(b.threadId)) ||
        a.miles - b.miles ||
        b.when.localeCompare(a.when),
    );
    return {
      cardId,
      people: sorted,
      nearest: Math.min(...people.map((person) => person.miles)),
      newest: people.reduce((latest, person) =>
        person.when > latest.when ? person : latest,
      ).when,
    };
  });

  return groups.sort((a, b) => {
    if (sort === "closest") {
      return a.nearest - b.nearest || b.people.length - a.people.length;
    }
    if (sort === "newest") return b.newest.localeCompare(a.newest);
    return b.people.length - a.people.length || a.nearest - b.nearest;
  });
}

/** Everybody across the groups, once each. */
export function distinctPeople(matches: GroupableMatch[]): number {
  return new Set(matches.map((match) => match.wanter.playerId)).size;
}
