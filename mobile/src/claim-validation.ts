/**
 * What is wrong with a claim, field by field, before it leaves the phone.
 *
 * THE BUG THIS FIXES was a form that looked broken while doing exactly
 * what it was told. The founder typed a junk value into the OPTIONAL
 * store-email field, the server rejected the whole claim with one
 * message and no field name, and the app printed "That doesn't look
 * like an email address" at the very bottom - two inputs below the
 * email he had typed correctly. He reported the email section as not
 * working. It was working; it just could not say WHERE.
 *
 * So the same rules run here, per field, and each message is drawn
 * against the input it belongs to. The server still validates - this is
 * a convenience, not a defence - and the two rulebooks are held
 * together by a drift test that runs both over the same inputs
 * (tests/unit/claim-validation-drift.test.ts).
 */

/**
 * Good enough to catch a typo, and nothing more. Mirrors
 * LOOKS_LIKE_EMAIL in src/lib/stores/claim-schema.ts - the address is
 * verified by sending mail to it, and a stricter pattern's whole effect
 * is to reject somebody's real, unusual address.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors NOTES_LIMIT in claim-schema.ts. */
const NOTES_LIMIT = 500;

/**
 * The five fields a claim carries. Declared here rather than imported
 * from api.ts, and that is load-bearing: this module is typechecked by
 * the WEBSITE's drift test too, and importing api.ts would drag React
 * Native's global types into the web's program, where its FormData
 * fights the DOM's. Structural typing keeps the two declarations
 * honest - a claim from api.ts assigns here or nothing compiles.
 */
export interface ClaimFieldValues {
  claimantName: string;
  claimantEmail: string;
  claimantRole: string;
  businessEmail: string;
  notes: string;
}

export type ClaimErrors = Partial<Record<keyof ClaimFieldValues, string>>;

export function validateClaimFields(fields: ClaimFieldValues): ClaimErrors {
  const errors: ClaimErrors = {};

  const name = fields.claimantName.trim();
  const email = fields.claimantEmail.trim();
  const business = fields.businessEmail.trim();

  if (!name) errors.claimantName = "Tell us who you are.";

  if (!email) {
    errors.claimantEmail = "We need an address to reply to.";
  } else if (!LOOKS_LIKE_EMAIL.test(email)) {
    errors.claimantEmail = "That doesn't look like an email address.";
  }

  if (business && !LOOKS_LIKE_EMAIL.test(business)) {
    errors.businessEmail = "That doesn't look like an email address.";
  }

  if (fields.notes.length > NOTES_LIMIT) {
    errors.notes = `Keep it under ${NOTES_LIMIT} characters.`;
  }

  return errors;
}
