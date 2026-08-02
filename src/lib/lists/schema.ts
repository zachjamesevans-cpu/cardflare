import { z } from "zod";

import { UNSAFE_CHARACTERS } from "@/lib/players/schema";
import type { EventCardKind } from "@/lib/supabase/types";

/**
 * Flares and Have List entries, and the rules around them.
 *
 * Free of server-only imports so the validation can be tested without a
 * database — the same reason `src/lib/waitlist/form-data.ts` is.
 *
 * Product language, per PRODUCT.md: a **Flare** is a live request for a card;
 * a **Have** is a card a player has with them. `kind` is the only difference
 * between them in storage.
 */

/**
 * Caps per player, per event.
 *
 * The Flare board is public and shared, so one person listing a thousand cards
 * ruins the room for everyone in it. Haves are private and are closer to an
 * inventory, so the ceiling is higher — someone emptying a binder into it is
 * using the feature, not abusing it.
 */
export const MAX_FLARES = 30;
export const MAX_HAVES = 200;

export const MAX_QUANTITY = 99;
export const MAX_NOTE = 140;

export function capFor(kind: EventCardKind): number {
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
});

export type AddEntryInput = z.infer<typeof addEntrySchema>;

export const kindSchema = z.enum(["flare", "have"]);

/** What the form shows after a submission. */
export type ListState =
  | { status: "idle" }
  | { status: "added"; kind: EventCardKind; cardName: string }
  | { status: "error"; message: string };

export const LIST_IDLE: ListState = { status: "idle" };

/** Nouns, so copy and messages never drift from PRODUCT.md's vocabulary. */
export const KIND_LABELS: Record<EventCardKind, { one: string; many: string }> = {
  flare: { one: "Flare", many: "Flares" },
  have: { one: "card you have", many: "cards you have" },
};

export function atCapMessage(kind: EventCardKind): string {
  return kind === "flare"
    ? `You can have ${MAX_FLARES} Flares open at once. Cancel one to post another.`
    : `Your Have list is capped at ${MAX_HAVES} cards for one event.`;
}
