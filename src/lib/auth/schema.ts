import { z } from "zod";

/**
 * Validation for the sign-in and password forms.
 *
 * Free of server-only imports so it stays directly unit-testable, the same
 * arrangement as `src/lib/waitlist/form-data.ts`.
 */

/**
 * Long enough to be worth having.
 *
 * Supabase's own floor is six characters, which is not a password. Ten is the
 * shortest length that survives an offline guess of anything but the very
 * worst choices, and it is what NIST recommends as a user-chosen minimum.
 * Composition rules — a digit, a symbol, a capital — are deliberately absent:
 * they push people towards `Password1!` and are no longer recommended.
 *
 * The server-side floor is a Supabase project setting and has to be raised
 * there too; this only governs cardflare's own forms. See docs/DEPLOYMENT.md.
 */
export const PASSWORD_MIN = 10;

/**
 * A ceiling, because bcrypt silently truncates past 72 bytes.
 *
 * Without this a 200-character passphrase would appear to be accepted while
 * only its first 72 bytes were ever checked — so two different passwords
 * sharing a prefix would both work, which is a surprise nobody wants to find
 * out about later.
 */
export const PASSWORD_MAX = 72;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Please enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Please enter a valid email address."))
  .transform((value) => value.toLowerCase());

/**
 * Checked only for length on the way in.
 *
 * A sign-in form must not tell someone their password is "too short" — that
 * is a fact about the stored password, and volunteering it helps whoever is
 * guessing. Length here is purely a bound on what reaches the auth server.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Please enter your password.")
    .max(PASSWORD_MAX, "That password is too long."),
});

/** Choosing a new password, where the rules do belong. */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, `Please use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Please use no more than ${PASSWORD_MAX} characters.`),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    message: "Those two passwords do not match.",
    path: ["confirm"],
  });

export const requestResetSchema = z.object({ email: emailSchema });

export type SignInFieldErrors = Partial<Record<"email" | "password", string>>;
export type NewPasswordFieldErrors = Partial<Record<"password" | "confirm", string>>;

/**
 * Picks the message belonging to a named field.
 *
 * Taking `issues[0]` instead means whichever rule happened to fail first
 * decides what the user reads, which is how an internal detail ends up in
 * front of somebody.
 */
export function messageFor(
  issues: { path: PropertyKey[]; message: string }[],
  field: string,
): string | undefined {
  return issues.find((issue) => issue.path[0] === field)?.message;
}

export function fieldErrorsFrom<T extends string>(
  issues: { path: PropertyKey[]; message: string }[],
  fields: readonly T[],
): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {};

  for (const field of fields) {
    const message = messageFor(issues, field);
    if (message) errors[field] = message;
  }

  return errors;
}
