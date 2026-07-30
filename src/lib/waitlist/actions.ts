"use server";

import { headers } from "next/headers";

import { checkRateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { insertWaitlistSignup } from "./repository";
import { parseWaitlistFormData } from "./form-data";
import { valuesFromSubmission, type WaitlistFormState } from "./schema";

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
  if (parsed.kind === "bot") {
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

  try {
    const result = await insertWaitlistSignup(parsed.data, await requestSource());

    return {
      status: "success",
      alreadyRegistered: result.outcome === "duplicate",
    };
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
