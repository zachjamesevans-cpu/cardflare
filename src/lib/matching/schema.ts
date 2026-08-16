import { z } from "zod";

import { UNSAFE_CHARACTERS } from "@/lib/players/schema";

/**
 * The matching rules, free of server-only imports so they can be tested
 * without a database — the same discipline as `lists/schema.ts`.
 *
 * Matching here means: which Flares in this room can *this viewer* answer
 * from their own binder. It is computed per viewer at read time and never
 * broadcast, which is the privacy line Milestone 6 drew — the room learns
 * that somebody can help only when that somebody chooses to say so.
 */

/**
 * How well a binder answers a Flare.
 *
 * - `exact` — the Flare takes any printing and you hold the card, or it names
 *   a printing and you hold that printing.
 * - `other-printing` — the Flare names a printing; you hold the card but not
 *   (verifiably) that printing. Shown differently, because telling a player
 *   "you have this" when the requester wants the alt art and they hold the
 *   base is the guess Milestone 6 deliberately left unmade. Still worth a
 *   conversation, so it is still a match — just an honest one.
 */
export type MatchKind = "exact" | "other-printing";

/**
 * The viewer's binder, shaped for matching: per held card, the set of
 * printings the binder *names*. A card whose only entry names no printing is
 * a key with an empty set — the owner has it, in some printing they did not
 * specify, which is exactly the shape `matchFor` needs: key presence answers
 * "do you have the card", the set answers "can you prove which printing".
 */
export type HeldByCard = Map<string, Set<string>>;

export function heldByCard(
  binder: { cardId: string; printingId: string | null }[],
): HeldByCard {
  const held: HeldByCard = new Map();

  for (const entry of binder) {
    const printings = held.get(entry.cardId) ?? new Set<string>();
    if (entry.printingId !== null) printings.add(entry.printingId);
    held.set(entry.cardId, printings);
  }

  return held;
}

/**
 * How many copies the viewer's binder claims, per card.
 *
 * The binder only — never the synced collection, which knows printings but
 * not counts. A card the collection proves and the binder does not simply
 * has no number, and the phrase below says nothing about how many rather
 * than saying "1" and being wrong.
 */
export function heldCountByCard(
  binder: { cardId: string; quantity: number }[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of binder) {
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.quantity);
  }

  return counts;
}

/**
 * What the card viewer says about a card you are holding.
 *
 * The founder's three phrases, as three states of one line. Only ever
 * reached by tapping a card: the board marks what you hold with a green
 * ring, and a ring says "look here" in a glance, while a sentence on every
 * tile is a wall of them. The sentence is the answer to the tap.
 *
 * A count only appears above one, because "You have 1 in your binder" is a
 * worse way of saying "You have this". A printing you cannot prove never
 * carries a number at all: the interesting fact there is the mismatch, and
 * a count beside it reads as a promise about the wrong version.
 */
export function youHaveLabel(kind: MatchKind, count: number): string {
  if (kind === "other-printing") return "You have another printing";
  return count > 1 ? `You have ${count} in your binder` : "You have this";
}

/**
 * Whether — and how well — the viewer can answer one Flare.
 *
 * A Flare that names a printing is answered exactly only by that printing.
 * A binder entry with no printing named is not proof of the right one, so it
 * downgrades to `other-printing` rather than upgrading to `exact`: claiming
 * the match would be guessing, and one wrong "you have this" costs more
 * trust than ten missed matches.
 */
export function matchFor(
  flare: { cardId: string; printingId: string | null },
  held: HeldByCard,
): MatchKind | null {
  const printings = held.get(flare.cardId);
  if (!printings) return null;

  if (flare.printingId === null) return "exact";

  return printings.has(flare.printingId) ? "exact" : "other-printing";
}

/**
 * Open offers per player per room.
 *
 * The same reasoning as the Flare cap: offers put your name in front of other
 * players, and one person offering on everything stops reading as helpful.
 * Matching the Flare cap keeps the two halves of the board symmetrical.
 */
export const MAX_OFFERS = 30;

export const MAX_OFFER_MESSAGE = 80;

/**
 * "Where can they find you?" — short free text, same character hygiene as
 * notes and display names, because it renders beside a name on somebody
 * else's screen.
 */
export const offerMessageSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(MAX_OFFER_MESSAGE, `Keep it under ${MAX_OFFER_MESSAGE} characters.`)
      .refine((value) => !UNSAFE_CHARACTERS.test(value), {
        message: "Please use ordinary characters.",
      }),
  )
  .transform((value) => value || null);

/**
 * "How many can you bring?" — clamped to the same 1..99 the Flare's own
 * quantity lives in. Anything unparseable is one copy, never a refusal:
 * the pledge is the thing that matters and the count is a refinement.
 */
export const offerQuantitySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(99)
  .catch(1)
  .default(1);

/** One offer, as the Flare's author sees it. */
export interface Offer {
  flareId: string;
  responderSessionId: string;
  displayName: string | null;
  message: string | null;
  /** How many copies they said they can bring. */
  quantity: number;
  /** Inside the presence window, same rule as the lobby. */
  present: boolean;
}

/**
 * The arithmetic under "still needs one more".
 *
 * The founder's example: Damian asks for 2x Brook, Chunc pledges one —
 * the room should read "1 of 2 spoken for, still needs 1 more", so the
 * next holder knows the hunt is still on. Pledged is capped at the ask
 * for display (three people bringing five copies of a two-of is still
 * "all 2 spoken for"), remaining never goes below zero.
 */
export function pledgeTally(
  offers: Offer[],
  asked: number,
): { pledged: number; remaining: number } {
  const total = offers.reduce((sum, offer) => sum + offer.quantity, 0);
  return {
    pledged: Math.min(total, asked),
    remaining: Math.max(0, asked - total),
  };
}

/** Offers grouped by the Flare they answer, for O(1) lookup while rendering. */
export function offersByFlare(offers: Offer[]): Map<string, Offer[]> {
  const grouped = new Map<string, Offer[]>();

  for (const offer of offers) {
    const list = grouped.get(offer.flareId) ?? [];
    list.push(offer);
    grouped.set(offer.flareId, list);
  }

  return grouped;
}

/**
 * The order a player's rail puts its cards in.
 *
 * Two rules, and they can disagree. Cards you can answer come first — the
 * founder's replacement for the old "you have 2 of 6" badge: "all cards you
 * have will automatically sort to the leftmost portion of the carousel",
 * because a rail you can only read the front of should open on the part
 * that concerns you. Fully pledged hunts park at the far end, dimmed but
 * present, so the bring-extras crowd can still see the ask.
 *
 * When both apply, settled outranks interesting: a card you hold that
 * somebody else has already promised is at the end with the rest of the
 * settled ones, not at the front pretending to need you.
 *
 * Extracted from the board so the app can hold the identical rule and so
 * the disagreement above is pinned by a test rather than by two comments.
 */
export function inRailOrder<T>(
  items: T[],
  held: (item: T) => boolean,
  covered: (item: T) => boolean,
): T[] {
  return [
    ...items.filter((item) => !covered(item) && held(item)),
    ...items.filter((item) => !covered(item) && !held(item)),
    ...items.filter(covered),
  ];
}
