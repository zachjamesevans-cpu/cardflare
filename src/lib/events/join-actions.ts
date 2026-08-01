"use server";

import { redirect } from "next/navigation";

import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { isValidJoinCode, normalizeJoinCode } from "./join-code";
import { findEventByJoinCode } from "./repository";
import type { JoinCodeState } from "./join-state";

/**
 * Codes are short, so the form is a guessing surface.
 *
 * A billion codes makes blind guessing hopeless on its own, but the limit
 * stops someone grinding through candidates and turns a scripted sweep into
 * something visible. Set well above what a person mistyping a code needs.
 */
const LOOKUP_MAX = 15;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

/** Deliberately identical for a malformed code and one that does not exist. */
const NOT_FOUND = "We couldn't find an event with that code. Check it and try again.";

export async function lookUpJoinCode(
  _previous: JoinCodeState,
  formData: FormData,
): Promise<JoinCodeState> {
  const submitted = text(formData, "code");
  const code = normalizeJoinCode(submitted);

  const rate = checkRateLimit(
    `join-code:${await clientKey()}`,
    LOOKUP_MAX,
    LOOKUP_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many attempts. Please wait a few minutes and try again.",
      code: submitted,
    };
  }

  /*
   * A malformed code returns the same message as a valid one that matches
   * nothing. Saying "that isn't a valid code" would confirm the alphabet and
   * length to anyone probing, and is no more useful to a player who has
   * simply mistyped.
   */
  if (!isValidJoinCode(code)) {
    return { status: "error", message: NOT_FOUND, code: submitted };
  }

  /*
   * Deliberately not NOT_FOUND. Telling a player their code is wrong during an
   * outage sends them back to a counter where the code is, in fact, correct.
   */
  if (!isSupabaseConfigured()) {
    console.error("Join code lookup rejected: Supabase is not configured.");
    return {
      status: "error",
      message: "We can't look that up right now. Please try again in a moment.",
      code: submitted,
    };
  }

  const event = await findEventByJoinCode(code);
  if (!event) {
    return { status: "error", message: NOT_FOUND, code: submitted };
  }

  redirect(`/e/${code}`);
}
