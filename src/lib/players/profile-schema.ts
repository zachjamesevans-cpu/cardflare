import { z } from "zod";

import { BIO_MAX, PRONOUNS_MAX } from "./profile-state";

/**
 * Shared types for the profile actions.
 *
 * Outside the "use server" file because an actions module may export only
 * async functions, and free of server-only imports so the same schema can
 * be reasoned about in a unit test.
 */

/*
 * The limits and the forms' idle states live in profile-state.ts, which
 * has no zod in it, and are re-exported here so the server keeps one
 * import. A component in the browser imports profile-state.ts directly.
 */
export * from "./profile-state";

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Pick a name people will recognise across the table.")
    .max(40, "Keep the name under 40 characters."),
});

/**
 * The two lines Instagram's Edit profile has under the username, saved
 * together. Both optional: an empty field clears the column. The bio
 * keeps its line breaks, up to three lines, because "Married to the
 * bit / founder / My new song" is three lines on purpose.
 */
export const aboutSchema = z.object({
  pronouns: z
    .string()
    .trim()
    .max(PRONOUNS_MAX, `Keep pronouns under ${PRONOUNS_MAX} characters.`)
    .transform((value): string | null => value || null),
  bio: z
    .string()
    .transform((value: string) => value.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .max(BIO_MAX, `Keep the bio under ${BIO_MAX} characters.`)
        .refine(
          (value: string) => value.split("\n").length <= 4,
          "Keep the bio to four lines.",
        ),
    )
    .transform((value): string | null => value || null),
});
