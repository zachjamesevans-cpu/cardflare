"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { sendEmail } from "@/lib/email/client";
import { waitlistConfirmationEmail } from "@/lib/email/waitlist-confirmation";
import { checkRateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { insertWaitlistSignup } from "./repository";
import { parseWaitlistFormData } from "./form-data";
import {
  valuesFromSubmission,
  type WaitlistFormState,
  type WaitlistSubmission,
} from "./schema";

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

/**
 * Waitlist submission handler.
 *
 * A Server Action is a public POST endpoint, so everything here re-validates
 * from scratch: client-side validation is a convenience, never a control.
 */
export async function submitWaitlist(
  _previous: WaitlistFormState,
  formData: FormData,
): Promise<WaitlistFormState> {
  const parsed = parseWaitlistFormData(formData);

  // Silently accept bot submissions. Telling a scripted client it was detected
  // just teaches the next attempt what to avoid.
  //
  // Silent to the client, never silent to us: this path discards a submission
  // while showing success, so without a log a false positive is invisible from
  // both ends — no row, no email, no error, nothing to search for.
  if (parsed.kind === "bot") {
    console.warn(`Waitlist submission discarded by anti-spam: ${parsed.reason}.`);
    return { status: "success", alreadyRegistered: false };
  }

  if (parsed.kind === "invalid") {
    return {
      status: "error",
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  const rate = checkRateLimit(
    `waitlist:${await clientKey()}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many attempts. Please wait a few minutes and try again.",
      fieldErrors: {},
      values: valuesFromSubmission(parsed.data),
    };
  }

  if (!isSupabaseConfigured()) {
    console.error("Waitlist submission rejected: Supabase is not configured.");
    return {
      status: "error",
      message: GENERIC_ERROR,
      fieldErrors: {},
      values: valuesFromSubmission(parsed.data),
    };
  }

  let result;

  try {
    result = await insertWaitlistSignup(parsed.data, await requestSource());
  } catch (error) {
    // Log server-side detail; never return it, since it can carry database
    // internals or the submitted address.
    console.error("Waitlist submission failed", error);
    return {
      status: "error",
      message: GENERIC_ERROR,
      fieldErrors: {},
      values: valuesFromSubmission(parsed.data),
    };
  }

  // Past this point the row is stored, so the signup has succeeded and nothing
  // that follows may change that. The email is scheduled outside the try above
  // deliberately: were it inside, a throw from the email path would report a
  // perfectly good signup back to the visitor as a failure.
  if (result.outcome === "created") {
    queueConfirmationEmail(parsed.data);
  } else {
    // The other reason a signup produces no email. Logged so "nothing arrived"
    // can be told apart from "nothing was attempted" without guesswork.
    console.info("Waitlist submission was a duplicate; no email sent.");
  }

  return {
    status: "success",
    alreadyRegistered: result.outcome === "duplicate",
  };
}

/**
 * Sends the confirmation after the response has gone out.
 *
 * Two deliberate choices here:
 *
 * `after()` keeps the provider off the critical path — the visitor sees their
 * confirmation immediately, and a slow or unreachable provider cannot make the
 * form feel broken.
 *
 * It fires only when a row was actually created, never on a duplicate. Beyond
 * being the sensible message, that makes the email un-repeatable: resubmitting
 * an address that is already stored sends nothing, so the form cannot be used
 * to flood someone else's inbox.
 */
function queueConfirmationEmail(submission: WaitlistSubmission): void {
  try {
    after(async () => {
      try {
        const result = await sendEmail(
          waitlistConfirmationEmail(submission.firstName, submission.email, siteUrl()),
        );

        // The signup is already stored, so a failure here is worth knowing
        // about but is not worth surfacing to anyone.
        if (result.status === "failed") {
          console.error(`Waitlist confirmation email failed: ${result.reason}`);
        }
      } catch (error) {
        // `sendEmail` is written not to reject, but this callback runs detached
        // from the request. An unhandled rejection out here would be an
        // unexplained crash in the logs rather than a diagnosable line.
        console.error("Unexpected failure sending the confirmation email", error);
      }
    });
  } catch (error) {
    // `after` needs a request context. Losing a confirmation email is a far
    // smaller problem than losing the signup, so this stays contained.
    console.error("Could not schedule the confirmation email", error);
  }
}

/** Coarse per-client key for rate limiting. */
async function clientKey(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();

  return ip || headerList.get("x-real-ip") || "unknown";
}

/** Records where a signup came from, for later attribution. */
async function requestSource(): Promise<string | null> {
  const referer = (await headers()).get("referer");
  if (!referer) return null;

  try {
    const url = new URL(referer);
    return `${url.host}${url.pathname}`.slice(0, 120);
  } catch {
    return null;
  }
}
