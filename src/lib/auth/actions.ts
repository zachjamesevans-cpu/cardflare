"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientKey } from "@/lib/request-context";
import { safeNextPath } from "./redirect";
import type { SignInState } from "./state";

const SIGN_IN_MAX = 5;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Only the email is validated here.
 *
 * `next` is deliberately absent: `safeNextPath` is its validator, it already
 * accepts null and undefined, and putting it in this schema made a missing
 * hidden field fail the whole parse.
 */
const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .max(254, "That email address is too long.")
    .pipe(z.email("Please enter a valid email address."))
    .transform((value) => value.toLowerCase()),
});

/**
 * Sends a magic link.
 *
 * The response is identical whether or not the address belongs to a store, so
 * this cannot be used to discover who is in the beta. Supabase only creates an
 * account for addresses that already exist, because `shouldCreateUser` is off
 * — an uninvited address gets the same confirmation and no email.
 */
export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({ email: text(formData, "email") });

  if (!parsed.success) {
    // Take the email field's own message rather than whichever issue happens
    // to be first, so an internal validation detail can never reach the user.
    const emailIssue = parsed.error.issues.find((issue) => issue.path[0] === "email");

    return {
      status: "error",
      message: emailIssue?.message ?? "Please enter a valid email address.",
    };
  }

  const rate = checkRateLimit(
    `signin:${await clientKey()}`,
    SIGN_IN_MAX,
    SIGN_IN_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  const nextPath = safeNextPath(text(formData, "next"));
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // Accounts are created by the admin console, never by signing in.
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    // Logged, not returned: the message distinguishes known from unknown
    // addresses, which would turn this form into a membership oracle.
    console.error("Sign-in link request failed", error.message);
  }

  return { status: "sent" };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
