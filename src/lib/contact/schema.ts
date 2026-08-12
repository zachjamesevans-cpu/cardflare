import { z } from "zod";

import { text } from "@/lib/form-value";

/**
 * The contact form's shape and its anti-spam, kept free of server-only
 * imports so it unit-tests directly — the same split the waitlist form
 * uses, and for the same reason.
 *
 * One difference from the waitlist, and it drives the whole design: a
 * waitlist signup is stored first and emailed second, so the email is
 * a courtesy. Here the email IS the delivery. Nothing is stored, so a
 * send that did not happen must never be reported as a message that
 * did — see the action.
 */

export const NAME_MAX = 80;
export const SUBJECT_MAX = 120;
export const MESSAGE_MAX = 2_000;

/**
 * Anti-spam field names, deliberately innocuous so a bot filling every
 * input it can see trips them. Named separately from the waitlist's so
 * the two forms can be tuned apart, with the same meaning.
 */
export const HONEYPOT_FIELD = "company_website";
export const RENDERED_AT_FIELD = "form_rendered_at";

/** Fastest plausible human completion. Forgeable, so a filter and not a control. */
export const MIN_FILL_MS = 2_000;

export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(NAME_MAX, `Please keep your name under ${NAME_MAX} characters.`),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .max(254, "That email address is too long.")
    .pipe(z.email("Please enter a valid email address."))
    .transform((value) => value.toLowerCase()),
  subject: z
    .string()
    .trim()
    .max(SUBJECT_MAX, `Please keep the subject under ${SUBJECT_MAX} characters.`)
    .transform((value) => (value.length === 0 ? "No subject" : value)),
  message: z
    .string()
    .trim()
    .min(1, "Please write a message.")
    .max(MESSAGE_MAX, `Please keep your message under ${MESSAGE_MAX} characters.`),
});

export type ContactSubmission = z.infer<typeof contactSchema>;

export const ECHOED_FIELDS = ["name", "email", "subject", "message"] as const;
export type ContactValues = Record<(typeof ECHOED_FIELDS)[number], string>;
export type ContactFieldErrors = Partial<ContactValues>;

export type ContactState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors: ContactFieldErrors;
      values: ContactValues;
    }
  | { status: "sent" };

export const CONTACT_IDLE: ContactState = { status: "idle" };

export type ParsedContactForm =
  | { kind: "bot"; reason: "honeypot" | "too-fast" }
  | { kind: "invalid"; fieldErrors: ContactFieldErrors; values: ContactValues }
  | { kind: "valid"; data: ContactSubmission };

/** Longest string echoed back, so a huge paste cannot bloat the response. */
const MAX_ECHOED_LENGTH = MESSAGE_MAX;

function echoedValues(formData: FormData): ContactValues {
  return Object.fromEntries(
    ECHOED_FIELDS.map((field) => [
      field,
      text(formData, field).slice(0, MAX_ECHOED_LENGTH),
    ]),
  ) as ContactValues;
}

export function parseContactFormData(
  formData: FormData,
  now: number = Date.now(),
): ParsedContactForm {
  if (text(formData, HONEYPOT_FIELD).trim() !== "") {
    return { kind: "bot", reason: "honeypot" };
  }

  const renderedAt = Number(text(formData, RENDERED_AT_FIELD));
  if (Number.isFinite(renderedAt) && renderedAt > 0 && now - renderedAt < MIN_FILL_MS) {
    return { kind: "bot", reason: "too-fast" };
  }

  const parsed = contactSchema.safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    subject: text(formData, "subject"),
    message: text(formData, "message"),
  });

  if (!parsed.success) {
    const fieldErrors: ContactFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !(field in fieldErrors)) {
        fieldErrors[field as keyof ContactValues] = issue.message;
      }
    }
    return { kind: "invalid", fieldErrors, values: echoedValues(formData) };
  }

  return { kind: "valid", data: parsed.data };
}

export function valuesFromSubmission(submission: ContactSubmission): ContactValues {
  return {
    name: submission.name,
    email: submission.email,
    subject: submission.subject === "No subject" ? "" : submission.subject,
    message: submission.message,
  };
}
