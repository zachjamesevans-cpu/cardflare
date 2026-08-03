import { z } from "zod";

export const USER_TYPES = [
  { value: "player", label: "Player" },
  { value: "store", label: "Local game store" },
  { value: "vendor", label: "Card show vendor" },
  { value: "tournament_organizer", label: "Tournament organizer" },
  { value: "creator", label: "Content creator or community organizer" },
  { value: "other", label: "Other" },
] as const;

export type UserType = (typeof USER_TYPES)[number]["value"];

const USER_TYPE_VALUES = USER_TYPES.map((t) => t.value) as [UserType, ...UserType[]];

/**
 * Normalizes an email for storage and duplicate detection: trims surrounding
 * whitespace and lowercases it. The local part of an address is technically
 * case-sensitive per RFC 5321, but every mainstream provider treats it as
 * insensitive, and matching that expectation is what stops one person signing
 * up three times. Deliberately does NOT strip dots or `+tags` — those identify
 * genuinely different inboxes at some providers.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Collapses blank-ish optional input to null so the DB stores absence consistently. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);
}

export const waitlistSubmissionSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "Please enter your first name.")
    .max(80, "Please keep your first name under 80 characters."),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .max(254, "That email address is too long.")
    .pipe(z.email("Please enter a valid email address."))
    .transform(normalizeEmail),
  userType: z.enum(USER_TYPE_VALUES, {
    message: "Please choose the option that best describes you.",
  }),
  primaryGame: optionalText(80),
  city: optionalText(80),
  region: optionalText(80),
  storeName: optionalText(120),
  comment: optionalText(500),
  /**
   * Optional, and deliberately so.
   *
   * Joining a waitlist is a request to be told when the thing launches, so
   * that email is the service being asked for rather than marketing consent
   * to collect. Requiring a tick to permit the only message the list exists to
   * send is a checkbox for its own sake, and consent conditioned on access is
   * the kind that regulators treat as not freely given. The box now covers the
   * wider updates, where a real yes or no means something.
   */
  marketingConsent: z.boolean(),
  referralCode: optionalText(64),
});

export type WaitlistSubmission = z.infer<typeof waitlistSubmissionSchema>;

/** Field-keyed messages the form renders inline. */
export type WaitlistFieldErrors = Partial<Record<keyof WaitlistSubmission, string>>;

export type WaitlistFormState =
  | { status: "idle" }
  | { status: "success"; alreadyRegistered: boolean }
  | {
      status: "error";
      message: string;
      fieldErrors: WaitlistFieldErrors;
      values: WaitlistFormValues;
    };

/**
 * The raw strings the user typed, echoed back on a failed submission.
 *
 * React resets an uncontrolled form once a Server Action resolves, so without
 * this a mistyped email would wipe everything else the user had filled in.
 * Consent is deliberately excluded — a checkbox the user must tick knowingly
 * should never be re-ticked for them.
 */
export type WaitlistFormValues = Record<EchoedField, string>;

export const ECHOED_FIELDS = [
  "firstName",
  "email",
  "userType",
  "primaryGame",
  "city",
  "region",
  "storeName",
  "comment",
] as const;

export type EchoedField = (typeof ECHOED_FIELDS)[number];

export const EMPTY_VALUES: WaitlistFormValues = Object.fromEntries(
  ECHOED_FIELDS.map((field) => [field, ""]),
) as WaitlistFormValues;

export const WAITLIST_IDLE: WaitlistFormState = { status: "idle" };

/** Reads back what the user typed, so an error state can repopulate the form. */
export function valuesFor(state: WaitlistFormState): WaitlistFormValues {
  return state.status === "error" ? state.values : EMPTY_VALUES;
}

/**
 * Rebuilds echoable values from an already-validated submission, for failures
 * that happen after parsing (rate limit, database unavailable).
 */
export function valuesFromSubmission(
  submission: WaitlistSubmission,
): WaitlistFormValues {
  return {
    firstName: submission.firstName,
    email: submission.email,
    userType: submission.userType,
    primaryGame: submission.primaryGame ?? "",
    city: submission.city ?? "",
    region: submission.region ?? "",
    storeName: submission.storeName ?? "",
    comment: submission.comment ?? "",
  };
}

/** Flattens a Zod error into the one-message-per-field shape the form renders. */
export function toFieldErrors(error: z.ZodError): WaitlistFieldErrors {
  const fieldErrors: WaitlistFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as keyof WaitlistSubmission] = issue.message;
    }
  }

  return fieldErrors;
}
