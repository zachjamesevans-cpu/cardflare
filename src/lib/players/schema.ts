import { z } from "zod";

import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, UNSAFE_CHARACTERS } from "./name-rules";

/*
 * The limits, the unsafe-character test and the join form's idle state
 * live in name-rules.ts, which has no zod in it, and are re-exported
 * here so the server keeps one import. A component in the browser
 * imports name-rules.ts directly.
 */
export * from "./name-rules";

export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, `Please use at least ${DISPLAY_NAME_MIN} characters.`)
      .max(DISPLAY_NAME_MAX, `Please keep it under ${DISPLAY_NAME_MAX} characters.`)
      .refine((value) => !UNSAFE_CHARACTERS.test(value), {
        message: "Please use ordinary characters.",
      }),
  );

export const joinAsPlayerSchema = z.object({ displayName: displayNameSchema });

export type JoinAsPlayerInput = z.infer<typeof joinAsPlayerSchema>;
