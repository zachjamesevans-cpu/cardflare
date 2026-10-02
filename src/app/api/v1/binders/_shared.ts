import { z } from "zod";

import { BINDER_NAME_MAX, TRADE_BINDER_ID } from "@/lib/binder/binder";
import { isBinderCover, isBinderLayout } from "@/lib/binder/covers";

/** "trade", or a custom binder's id. Anything else is a 404. */
export const binderIdSchema = z.union([z.literal(TRADE_BINDER_ID), z.guid()]);

export const settingsSchema = z.object({
  isPublic: z.boolean().optional(),
  layout: z.custom<2 | 3>(isBinderLayout).optional(),
  cover: z.custom<string>(isBinderCover).optional(),
  frontEntryId: z.guid().nullable().optional(),
  name: z.string().trim().min(1).max(BINDER_NAME_MAX).optional(),
});

export const addCardSchema = z.object({
  cardId: z.guid(),
  printingId: z.guid().nullable().optional().default(null),
  quantity: z.number().int().min(1).max(99).optional().default(1),
});

export const createSchema = z.object({
  name: z.string().trim().min(1).max(BINDER_NAME_MAX),
  cover: z.custom<string>(isBinderCover).optional(),
});
