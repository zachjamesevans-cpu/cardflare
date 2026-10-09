import { z } from "zod";

import { MAX_SCAN_PAGES, POCKETS_PER_PAGE } from "@/lib/cards/scan-rules";

/**
 * Scanned pages, checked by the player, on their way into a binder: each
 * card with the exact pocket it sat in. The website's action and the
 * app's route read the same shape.
 */
export const binderPagesSchema = z.object({
  placements: z
    .array(
      z.object({
        pocket: z.number().int().min(0).max(899),
        cardId: z.guid(),
        printingId: z.guid().nullable().optional().default(null),
      }),
    )
    .min(1)
    .max(MAX_SCAN_PAGES * POCKETS_PER_PAGE)
    /* One card per pocket: two claims on a pocket is a client bug. */
    .refine(
      (placements) =>
        new Set(placements.map((placement) => placement.pocket)).size ===
        placements.length,
    ),
});
