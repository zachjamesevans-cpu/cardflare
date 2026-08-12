import { z } from "zod";

import { UNSAFE_CHARACTERS } from "@/lib/players/schema";

/**
 * Flares and the trade binder, and the rules around them.
 *
 * Free of server-only imports so the validation can be tested without a
 * database — the same reason `src/lib/waitlist/form-data.ts` is.
 *
 * Product language, per PRODUCT.md: a **Flare** is a live request for a card
 * in one room. The **Have List** is the player's trade binder, which follows
 * them between rooms.
 */

/** Which list an entry belongs to. */
export type ListKind = "flare" | "have";

/**
 * Caps.
 *
 * Flares are capped per player per event: the board is public and shared, so
 * one person listing hundreds of cards ruins the room for everyone in it.
 *
 * The binder is capped per player outright, because it is no longer scoped to
 * an event. Higher, because it is private and closer to an inventory —
 * somebody emptying a binder into it is using the feature, not abusing it.
 */
export const MAX_FLARES = 30;
export const MAX_HAVES = 200;

export const MAX_QUANTITY = 99;
export const MAX_NOTE = 140;

export function capFor(kind: ListKind): number {
  return kind === "flare" ? MAX_FLARES : MAX_HAVES;
}

/**
 * A note attached to an entry.
 *
 * Free text and deliberately short: "NM only", "happy to trade 2-for-1". Not a
 * structured preference model — nobody has specified one, and inventing a
 * taxonomy would bake in guesses about how people trade.
 *
 * Stripped of control, bidi and zero-width characters for the same reason
 * display names are: a note appears next to a player's name on a shared board,
 * and those characters exist to make text read as something it is not.
 */
export const noteSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(MAX_NOTE, `Keep it under ${MAX_NOTE} characters.`)
      .refine((value) => !UNSAFE_CHARACTERS.test(value), {
        message: "Please use ordinary characters.",
      }),
  )
  .transform((value) => value || null);

export const MAX_DECK_LABEL = 40;

/**
 * The deck a Flare belongs to. A label, not a decks table: "RG Luffy" typed
 * on each card of the hunt is what groups them into a folder on the board.
 * Cleaned the same way notes are, for the same shared-board reasons.
 */
export const deckLabelSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .max(MAX_DECK_LABEL, `Keep the deck name under ${MAX_DECK_LABEL} characters.`)
      .refine((value) => !UNSAFE_CHARACTERS.test(value), {
        message: "Please use ordinary characters.",
      }),
  )
  .transform((value) => value || null);

export const addEntrySchema = z.object({
  cardId: z.guid("Pick a card from the list."),
  /** Omitted or empty means any printing will do. */
  printingId: z
    .union([z.guid(), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  quantity: z.coerce
    .number()
    .int("Whole cards only.")
    .min(1, "At least one.")
    .max(MAX_QUANTITY, `At most ${MAX_QUANTITY}.`)
    .default(1),
  note: noteSchema.nullish().transform((value) => value ?? null),
  deckLabel: deckLabelSchema.nullish().transform((value) => value ?? null),
});

export type AddEntryInput = z.infer<typeof addEntrySchema>;

export const kindSchema = z.enum(["flare", "have"]);

/** What the form shows after a submission. */
export type ListState =
  | { status: "idle" }
  | { status: "added"; kind: ListKind; cardName: string }
  | { status: "error"; message: string };

export const LIST_IDLE: ListState = { status: "idle" };

export function atCapMessage(kind: ListKind): string {
  return kind === "flare"
    ? `You can have ${MAX_FLARES} Flares open at once. Cancel one to post another.`
    : `Your Have list is capped at ${MAX_HAVES} cards.`;
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether a binder needs confirming before it can be trusted in this room.
 *
 * The rule is "have you confirmed since this event started", not "is it older
 * than N hours". An event is the natural unit: you arrive, you say what you
 * are still carrying, and you are not asked again for the rest of the night
 * however many times you reload the page.
 *
 * Without this a portable binder quietly rots. Being told "Zach has this",
 * walking over, and finding he traded it last week costs more trust than never
 * being matched at all — one bad match does more damage than ten missed ones.
 */
export function needsConfirming(
  confirmedAt: (string | Date)[],
  eventStartedAt: string | Date,
): boolean {
  if (confirmedAt.length === 0) return false;

  const start = new Date(eventStartedAt).getTime();
  if (Number.isNaN(start)) return false;

  return confirmedAt.some((at) => {
    const when = new Date(at).getTime();
    // An unreadable timestamp is not evidence of freshness.
    return Number.isNaN(when) || when < start;
  });
}

/* -------------------------------------------------------------------------- */
/* Grouping the board                                                         */
/* -------------------------------------------------------------------------- */

/** One player and everything they are looking for. */
export interface PlayerGroup<T> {
  playerSessionId: string;
  displayName: string | null;
  entries: T[];
}

/**
 * Collects a room's Flares under the player who posted them.
 *
 * Someone hunting four cards was four separate rows with their name repeated
 * on each, so a busy board read as a wall of names rather than as a handful of
 * people. Grouping matches what a player is actually deciding: not "who wants
 * this card" but "who should I go and talk to".
 *
 * Order comes from the order in, which is newest first, so a group appears
 * where its most recent Flare would have — a player who just posted rises to
 * the top rather than being buried by whoever joined earliest. Cards inside a
 * group keep that order too.
 *
 * Generic over the minimum shape it needs so it stays free of the server-only
 * module that defines the full entry.
 */
export function groupByPlayer<
  T extends { playerSessionId: string; displayName: string | null },
>(entries: T[]): PlayerGroup<T>[] {
  const groups = new Map<string, PlayerGroup<T>>();

  for (const entry of entries) {
    const existing = groups.get(entry.playerSessionId);

    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    groups.set(entry.playerSessionId, {
      playerSessionId: entry.playerSessionId,
      // Taken from the first entry seen. A name lives on the session, so every
      // entry from one player carries the same one.
      displayName: entry.displayName,
      entries: [entry],
    });
  }

  return [...groups.values()];
}

/** A named hunt inside one player's section of the board. */
export interface DeckFolder<T> {
  /** As the player first typed it — display exactly this. */
  label: string;
  entries: T[];
}

/** One player's entries split into named folders and loose cards. */
export interface FolderedEntries<T> {
  folders: DeckFolder<T>[];
  loose: T[];
}

/**
 * Splits one player's entries into deck folders and loose cards.
 *
 * The label is typed once per card, so "RG Luffy" and "rg luffy" are the
 * same hunt: folders merge case-insensitively and keep the spelling of the
 * first card seen. Folder order and card order both follow the order in,
 * which the board already sorts newest first.
 */
export function partitionByDeck<T extends { deckLabel: string | null }>(
  entries: T[],
): FolderedEntries<T> {
  const folders = new Map<string, DeckFolder<T>>();
  const loose: T[] = [];

  for (const entry of entries) {
    const label = entry.deckLabel?.trim();

    if (!label) {
      loose.push(entry);
      continue;
    }

    const key = label.toLowerCase();
    const existing = folders.get(key);

    if (existing) {
      existing.entries.push(entry);
    } else {
      folders.set(key, { label, entries: [entry] });
    }
  }

  return { folders: [...folders.values()], loose };
}

/**
 * Splits a player's entries into what they are offering and what they
 * need, showcases first.
 *
 * The founder's placement: a showcase sits at the top of that player's
 * nest, above their hunt. Somebody scanning the board for a card to
 * pick up should meet the cards on offer before the cards being asked
 * for, and the two lists never interleave — they are opposite
 * statements and reading them as one list is how you walk over to
 * somebody about a card they were trying to get rid of.
 */
export function partitionByIntent<T extends { intent: "want" | "showcase" }>(
  entries: T[],
): { showcases: T[]; wants: T[] } {
  return {
    showcases: entries.filter((entry) => entry.intent === "showcase"),
    wants: entries.filter((entry) => entry.intent !== "showcase"),
  };
}
