/**
 * What somebody has to tell us to claim a shop, and what counts as told.
 *
 * Free of server imports so the rules are unit-testable, and separate
 * from `claim-actions.ts` because a `"use server"` module may export
 * nothing but async functions. Same split as
 * `discovery-schema.ts` beside `discovery-actions.ts`.
 *
 * DELIBERATELY SHORT. Every field here is one an owner can answer from
 * memory at their own counter; anything needing paperwork belongs in
 * the conversation an admin starts, not in a form that decides whether
 * they bother at all. The decision is a human reading this and saying
 * yes, so the form's job is to carry enough for that person to judge -
 * not to prove anything by itself.
 */
export interface ClaimFields {
  claimantName: string;
  claimantEmail: string;
  claimantRole: string;
  businessEmail: string;
  notes: string;
}

export interface ClaimState {
  status: "idle" | "sent" | "error";
  message: string | null;
  /** What they typed, so a rejected form comes back filled in. */
  fields: ClaimFields;
  /** Field name → what is wrong with it. */
  errors: Partial<Record<keyof ClaimFields, string>>;
}

export const EMPTY_CLAIM: ClaimFields = {
  claimantName: "",
  claimantEmail: "",
  claimantRole: "",
  businessEmail: "",
  notes: "",
};

export const CLAIM_IDLE: ClaimState = {
  status: "idle",
  message: null,
  fields: EMPTY_CLAIM,
  errors: {},
};

/** Roles the picker offers. "Other" is why `claimant_role` is free text. */
export const CLAIM_ROLES = [
  "Owner",
  "Manager",
  "Staff",
  "Event organiser",
  "Other",
] as const;

const NOTES_LIMIT = 500;

/*
 * Good enough to catch a typo, and nothing more.
 *
 * The address is verified by sending mail to it, which is the only test
 * that means anything. A stricter pattern's whole effect is to reject
 * somebody's real, unusual address - and the one person a claim form
 * cannot afford to turn away is the owner.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readClaim(form: { get(name: string): unknown }): ClaimFields {
  const text = (name: string) => String(form.get(name) ?? "").trim();

  return {
    claimantName: text("claimantName"),
    claimantEmail: text("claimantEmail"),
    claimantRole: text("claimantRole"),
    businessEmail: text("businessEmail"),
    notes: text("notes"),
  };
}

/**
 * What is wrong with this claim, field by field.
 *
 * An empty object means send it. Errors are keyed by field so each one
 * is drawn against the input it belongs to rather than piled into one
 * line at the top, which is the difference between a form somebody
 * fixes and a form somebody abandons.
 */
export function validateClaim(
  fields: ClaimFields,
): Partial<Record<keyof ClaimFields, string>> {
  const errors: Partial<Record<keyof ClaimFields, string>> = {};

  if (!fields.claimantName) {
    errors.claimantName = "Tell us who you are.";
  }

  if (!fields.claimantEmail) {
    errors.claimantEmail = "We need an address to reply to.";
  } else if (!LOOKS_LIKE_EMAIL.test(fields.claimantEmail)) {
    errors.claimantEmail = "That doesn't look like an email address.";
  }

  /*
   * The business address is optional, because plenty of small shops run
   * on a personal address and saying so is the honest answer. But an
   * address at the shop's own domain is the strongest thing a claim can
   * carry, so the field is offered and explained rather than demanded.
   */
  if (fields.businessEmail && !LOOKS_LIKE_EMAIL.test(fields.businessEmail)) {
    errors.businessEmail = "That doesn't look like an email address.";
  }

  if (fields.notes.length > NOTES_LIMIT) {
    errors.notes = `Keep it under ${NOTES_LIMIT} characters.`;
  }

  return errors;
}

export const CLAIM_NOTES_LIMIT = NOTES_LIMIT;
