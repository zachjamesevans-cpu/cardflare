import { z } from "zod";

/**
 * Putting cards in a binder, the parts any file may import: the shape a
 * batch arrives in and the sentence that says what happened. Mirrored
 * for the app in `mobile/src/binder-add-copy.ts`.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass."
 * So a batch is the Flare picker's tray, and a pasted list arrives the
 * same way once it has been looked up and confirmed.
 */

/** Cards one batch may carry: a pasted deck list's worth. */
export const BINDER_ADD_MAX = 120;

export const binderAddSchema = z.object({
  items: z
    .array(
      z.object({
        cardId: z.guid(),
        printingId: z.guid().nullable().optional().default(null),
        quantity: z.number().int().min(1).max(99).optional().default(1),
      }),
    )
    .min(1)
    .max(BINDER_ADD_MAX),
  /** The pocket tapped: the first card goes here, or the next empty one. */
  pocket: z.number().int().min(0).max(899).nullable().optional().default(null),
});

export const binderPlaceSchema = z.object({
  entryId: z.guid(),
  pocket: z.number().int().min(0).max(899),
});

/** "Added 3 cards.", "Added 2 cards. 1 was already here, so its count went up." */
export function binderAddedLine(result: {
  added: number;
  merged: number;
  skipped: number;
}): string {
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(`Added ${result.added} ${result.added === 1 ? "card" : "cards"}.`);
  }
  if (result.merged > 0) {
    parts.push(
      result.merged === 1
        ? "1 was already here, so its count went up."
        : `${result.merged} were already here, so their counts went up.`,
    );
  }
  if (result.skipped > 0) {
    parts.push(
      `The binder is full, so ${result.skipped} ${result.skipped === 1 ? "card was" : "cards were"} left out.`,
    );
  }
  return parts.join(" ") || "Nothing to add.";
}
