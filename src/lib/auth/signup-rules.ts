/*
 * The plain half of sign-up: the password floor, the email typo guard
 * and the form's idle state. No zod here, because the sign-up form
 * reads these in the browser, and the first page a new player ever
 * loads should not download a validation library to learn that a
 * password is eight characters. signup-schema.ts re-exports all of it.
 */

export const PASSWORD_MIN = 8;

/**
 * The address, typed once, with a second look at the domain.
 *
 * A typo in the email at sign-up is an account nobody can ever reset the
 * password of: the reset goes to the typo. The form used to ask for the
 * address twice to catch that. It asks once now, and this catches the
 * slips that actually happen, a mangled well-known domain, by offering
 * the fix under the field. It only ever suggests: nothing here blocks a
 * submit, and a domain that is not on the list is left alone, so a real
 * address is never "corrected".
 *
 * The list is short on purpose. Every key is a domain nobody has mail
 * at (a swapped or dropped letter in a big provider's name, a top-level
 * domain that does not exist, a missing dot). The app carries the same
 * list in mobile/src/email-typo.ts and
 * tests/unit/app-email-typo-parity.test.ts holds the two together.
 */
export const EMAIL_DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  gmailcom: "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  hotmailcom: "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  yahoocom: "yahoo.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  outlookcom: "outlook.com",
  "icloud.con": "icloud.com",
  icloudcom: "icloud.com",
};

/**
 * The address the person probably meant, or null when there is nothing
 * to say. The part before the at-sign comes back exactly as typed; only
 * the domain is swapped.
 */
export function emailTypoSuggestion(email: string): string | null {
  const typed = email.trim();
  const at = typed.lastIndexOf("@");
  if (at < 1 || typed.indexOf("@") !== at) return null;

  const domain = typed.slice(at + 1).toLowerCase();
  /* An own key only: "constructor" is not a typo of anything. */
  if (!Object.prototype.hasOwnProperty.call(EMAIL_DOMAIN_TYPOS, domain)) return null;

  return `${typed.slice(0, at)}@${EMAIL_DOMAIN_TYPOS[domain]}`;
}

/** The one line under the email field. The whole line is the button. */
export function emailTypoPrompt(suggestion: string): string {
  return `Did you mean ${suggestion}?`;
}

/**
 * Two addresses, compared the way the account is stored (trimmed,
 * lowercase), so "Zach@x.com" matches "zach@x.com ".
 *
 * Nothing asks for the address twice any more, but a form that still
 * has the second field (an older page left open in a tab) sends it, and
 * the sign-up action keeps refusing a mismatch for those. Kept here,
 * free of server imports.
 */
export function emailsMatch(email: string, confirm: string): boolean {
  const shape = (value: string) => value.trim().toLowerCase();
  return shape(email) !== "" && shape(email) === shape(confirm);
}

export const EMAIL_MISMATCH = "The two email addresses do not match.";

export type SignupState = { status: "idle" } | { status: "error"; message: string };

export const SIGNUP_IDLE: SignupState = { status: "idle" };

/**
 * A display name derived from the address.
 *
 * Sign-up asks for a real one now, so this is only used where there is
 * nobody to ask: an account created by an admin invitation, before its
 * owner has ever opened it. It must satisfy the players table (2 to 40
 * characters) whatever the address looks like.
 */
export function starterNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 40) : "New Player";
}
