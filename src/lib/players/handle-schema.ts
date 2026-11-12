import { z } from "zod";

import { HANDLE_MAX, HANDLE_MIN, HANDLE_PATTERN } from "./handle";

/** A handle as the server will store it: trimmed, lowercase, 3 to 20 of a-z, 0-9 and underscore. */
export const handleSchema = z.object({
  handle: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(HANDLE_MIN, `Handles are at least ${HANDLE_MIN} characters.`)
        .max(HANDLE_MAX, `Handles are at most ${HANDLE_MAX} characters.`)
        .regex(HANDLE_PATTERN, "Letters, numbers and underscores only. No spaces."),
    ),
});
