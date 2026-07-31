import { text } from "@/lib/form-value";
import {
  ECHOED_FIELDS,
  toFieldErrors,
  waitlistSubmissionSchema,
  type WaitlistFieldErrors,
  type WaitlistFormValues,
  type WaitlistSubmission,
} from "./schema";

/**
 * Anti-spam field names.
 *
 * Both are deliberately innocuous so a bot filling "every input it can see"
 * trips them. Shared between the form and the action so they cannot drift.
 */
export const HONEYPOT_FIELD = "company_website";
export const RENDERED_AT_FIELD = "form_rendered_at";

/**
 * Fastest plausible human completion of this form. Anything quicker is a
 * script. The timestamp originates on the client and is therefore forgeable —
 * this filters unsophisticated bots and is not a security control.
 */
export const MIN_FILL_MS = 2_000;

export type ParsedWaitlistForm =
  | { kind: "bot"; reason: "honeypot" | "too-fast" }
  | {
      kind: "invalid";
      fieldErrors: WaitlistFieldErrors;
      values: WaitlistFormValues;
    }
  | { kind: "valid"; data: WaitlistSubmission };

/** Longest string echoed back to the form, so a huge paste cannot bloat the response. */
const MAX_ECHOED_LENGTH = 512;

function echoedValues(formData: FormData): WaitlistFormValues {
  return Object.fromEntries(
    ECHOED_FIELDS.map((field) => [
      field,
      text(formData, field).slice(0, MAX_ECHOED_LENGTH),
    ]),
  ) as WaitlistFormValues;
}

/**
 * Turns raw FormData into a validated submission.
 *
 * Kept free of server-only imports so it can be unit tested directly and
 * reused if the submission path ever moves to a route handler.
 */
export function parseWaitlistFormData(
  formData: FormData,
  now: number = Date.now(),
): ParsedWaitlistForm {
  if (text(formData, HONEYPOT_FIELD).trim() !== "") {
    return { kind: "bot", reason: "honeypot" };
  }

  const renderedAt = Number(text(formData, RENDERED_AT_FIELD));
  if (Number.isFinite(renderedAt) && renderedAt > 0) {
    if (now - renderedAt < MIN_FILL_MS) {
      return { kind: "bot", reason: "too-fast" };
    }
  }

  const result = waitlistSubmissionSchema.safeParse({
    firstName: text(formData, "firstName"),
    email: text(formData, "email"),
    userType: text(formData, "userType"),
    primaryGame: text(formData, "primaryGame"),
    city: text(formData, "city"),
    region: text(formData, "region"),
    storeName: text(formData, "storeName"),
    comment: text(formData, "comment"),
    // An unchecked checkbox is absent from FormData entirely.
    marketingConsent: formData.get("marketingConsent") === "on",
    referralCode: text(formData, "referralCode"),
  });

  if (!result.success) {
    return {
      kind: "invalid",
      fieldErrors: toFieldErrors(result.error),
      values: echoedValues(formData),
    };
  }

  return { kind: "valid", data: result.data };
}
