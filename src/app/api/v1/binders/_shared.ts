import { z } from "zod";

import { BINDER_NAME_MAX } from "@/lib/binder/binder";
import { isBinderCover, type BinderCoverId } from "@/lib/binder/covers";

/** A binder's id. Anything else is a 404. */
export const binderIdSchema = z.guid();

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(BINDER_NAME_MAX).optional(),
  cover: z.custom<BinderCoverId>(isBinderCover).optional(),
  forTrade: z.boolean().optional(),
});

export const addCardSchema = z.object({
  cardId: z.guid(),
  printingId: z.guid().nullable().optional().default(null),
  quantity: z.number().int().min(1).max(99).optional().default(1),
});

export const createSchema = z.object({
  name: z.string().trim().min(1).max(BINDER_NAME_MAX),
  cover: z.custom<BinderCoverId>(isBinderCover).optional(),
  forTrade: z.boolean().optional(),
});

/**
 * The fields the app build in people's pockets still reads, filled in
 * so it does not crash on a binder with no "kind". Nothing new reads
 * them.
 */
export function forOldBuild<T extends { forTrade: boolean }>(
  binder: T,
): T & { kind: "trade" | "custom"; frontImageUrl: null; frontEntryId: null } {
  return {
    ...binder,
    kind: binder.forTrade ? "trade" : "custom",
    frontImageUrl: null,
    frontEntryId: null,
  };
}
