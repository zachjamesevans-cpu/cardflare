"use server";

import { headers } from "next/headers";

import { sendEmail } from "@/lib/email/client";
import { contactMessageEmail } from "@/lib/email/contact-message";
import { checkRateLimit } from "@/lib/rate-limit";
import { SITE } from "@/lib/site";
import {
  parseContactFormData,
  valuesFromSubmission,
  type ContactState,
} from "./schema";

/**
 * The contact form's handler.
 *
 * A Server Action is a public POST endpoint, so everything re-validates
 * from scratch and the anti-spam runs before anything else — the same
 * discipline the waitlist action uses.
 *
 * The one rule that shapes the rest: **the email is the only delivery**.
 * Nothing is stored, so unlike the waitlist (row first, email second,
 * sent with `after()` off the critical path) this action awaits the
 * send and reports success only if the provider actually accepted the
 * message. A form that says "thanks, we'll be in touch" over a message
 * that went nowhere is the worst kind of fake functionality: the person
 * walks away believing they have been heard.
 */

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Named so the visitor is never stranded when the provider is down. */
const DELIVERY_ERROR = `We could not send that just now. Please email ${SITE.contactInbox} directly and we will pick it up.`;

export async function submitContact(
  _previous: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = parseContactFormData(formData);

  /*
   * Silently accept bots — telling a script it was caught teaches the
   * next attempt what to avoid. Silent to the client, never to us: a
   * false positive is otherwise invisible from both ends.
   */
  if (parsed.kind === "bot") {
    console.warn(`Contact message discarded by anti-spam: ${parsed.reason}.`);
    return { status: "sent" };
  }

  if (parsed.kind === "invalid") {
    return {
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  /*
   * Tighter than the waitlist's five: this endpoint puts mail in a real
   * inbox, so it is the one worth being stingy with.
   */
  const rate = checkRateLimit(
    `contact:${await clientKey()}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many messages from here just now. Please try again shortly.",
      fieldErrors: {},
      values: valuesFromSubmission(parsed.data),
    };
  }

  const result = await sendEmail(contactMessageEmail(parsed.data, SITE.contactInbox));

  if (result.status !== "sent") {
    console.error(`Contact message not delivered: ${result.status}.`);
    return {
      status: "error",
      message: DELIVERY_ERROR,
      fieldErrors: {},
      values: valuesFromSubmission(parsed.data),
    };
  }

  return { status: "sent" };
}

async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();

  return ip || headerList.get("x-real-ip") || "unknown";
}
