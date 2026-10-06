/**
 * The address, typed twice at sign-up: the app's copy of
 * `emailsMatch` in the website's src/lib/auth/signup-schema.ts, kept
 * identical on purpose (tests/unit/sign-up-confirm-email.test.ts holds
 * the two to the same answers).
 *
 * A typo in the email is an account whose password reset goes to the
 * typo. Compared the way the account is stored, trimmed and lowercase,
 * so "Zach@x.com" matches "zach@x.com ".
 */
export function emailsMatch(email: string, confirm: string): boolean {
  const shape = (value: string) => value.trim().toLowerCase();
  return shape(email) !== "" && shape(email) === shape(confirm);
}

export const EMAIL_MISMATCH = "The two email addresses do not match.";
