/**
 * The address, typed once, with a second look at the domain: the app's
 * copy of `emailTypoSuggestion` in the website's
 * src/lib/auth/signup-schema.ts, kept identical on purpose
 * (tests/unit/app-email-typo-parity.test.ts holds the two to the same
 * list and the same answers).
 *
 * A typo in the email is an account whose password reset goes to the
 * typo. Sign-up used to ask for the address twice to catch that. It asks
 * once now, and a mangled well-known domain gets one line under the
 * field offering the fix. It only ever suggests: nothing here blocks a
 * submit, and a domain that is not on the list is left alone, so a real
 * address is never "corrected".
 *
 * The list is short on purpose. Every key is a domain nobody has mail
 * at (a swapped or dropped letter in a big provider's name, a top-level
 * domain that does not exist, a missing dot).
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
