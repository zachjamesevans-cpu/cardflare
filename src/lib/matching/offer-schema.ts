import { z } from "zod";

import { UNSAFE_CHARACTERS } from "@/lib/players/schema";

import { MAX_OFFER_MESSAGE } from "./schema";

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
