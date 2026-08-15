"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { openSignup } from "@/lib/auth/signup";
import { signupSchema } from "@/lib/auth/signup-schema";
import { siteUrl } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientKey } from "@/lib/request-context";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { ensureAuthUser } from "./provision";
import { isProviderEnabled } from "./providers";
import { claimPendingInvite } from "./session";
import { safeNextPath } from "./redirect";
import {
  fieldErrorsFrom,
  newPasswordSchema,
  requestResetSchema,
  signInSchema as passwordSignInSchema,
} from "./schema";
import type {
  NewPasswordState,
  PasswordSignInState,
  ResetRequestState,
  SignInState,
} from "./state";

const SIGN_IN_MAX = 5;
const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/**
 * Password attempts are limited twice over.
 *
 * Per IP catches one machine working through a list. Per address catches the
 * opposite shape — a botnet spread across many IPs all guessing at one known
 * store owner — which a per-IP limit alone does nothing about, and which is
 * the likelier attack once real accounts have real passwords.
 *
 * Ten is well above what somebody mistyping their own password needs and far
 * below what guessing needs.
 */
const PASSWORD_MAX_ATTEMPTS = 10;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/**
 * Deliberately the same for a wrong password, an unknown address, and an
 * account that has no password yet.
 *
 * Distinguishing them turns this form into a membership oracle: it would let
 * anyone confirm which stores are in the beta by typing addresses at it.
 */
const BAD_CREDENTIALS = "That email address and password do not match an account.";

const GENERIC_ERROR = "Something went wrong on our end. Please try again in a moment.";

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
 * this cannot be used to discover who is in the beta. `shouldCreateUser` is
 * off, so typing an address into this form can never create an account with
 * it — accounts come only from an admin inviting a store.
 *
 * That is also what made the first real store sign-in fail silently. Inviting
 * a store used to write only `stores` and `store_invites`, so Supabase had no
 * account to send a link to and sent nothing, while this form said "check your
 * email" as it says to everyone. Inviting now provisions the account, and the
 * call below is the second chance for anyone invited before that.
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

  /*
   * Provision on demand for an address with an invitation still open.
   *
   * Scoped to a pending invite, so this cannot be used to create an account
   * for an arbitrary address — and the response is unchanged either way, so it
   * reveals nothing about who has been invited.
   */
  await provisionIfInvited(parsed.data.email);

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

/**
 * Creates the auth account for an address that was invited but never got one.
 *
 * Recovery only. The invitation is the authority: no pending invite, no
 * account, and nothing about the outcome reaches the caller.
 */
async function provisionIfInvited(email: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { data, error } = await getSupabaseAdmin()
    .from("store_invites")
    .select("id")
    .eq("email", email)
    .is("accepted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Could not check for a pending invitation", error.message);
    return;
  }

  if (data) await ensureAuthUser(email);
}

/**
 * Signs in with an email address and a password.
 *
 * The way an operator gets in day to day. The magic link stays as the recovery
 * path — it is how somebody who has never set a password gets their first one,
 * and how anyone who forgets theirs gets back in — but nobody should have to
 * go to their inbox to open the store dashboard on a Friday night.
 *
 * A Server Action rather than a Route Handler because signing in writes the
 * session cookies, and Server Actions can. Nothing about this can happen in a
 * Server Component.
 */
/**
 * Open sign-up, the website's copy of the app's front door.
 *
 * Creates the account, creates the player, signs the browser in and
 * lands on the username step - one submit, no confirmation email, no
 * invite. The TestFlight link is the invitation on the phone; on the
 * web, finding the page is. Rate-limited harder than sign-in because
 * every success writes rows.
 */
export async function signUpWithPassword(
  _previous: PasswordSignInState,
  formData: FormData,
): Promise<PasswordSignInState> {
  const email = text(formData, "email");
  const parsed = signupSchema.safeParse({
    email,
    password: text(formData, "password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the fields.",
      fieldErrors: {},
      email,
    };
  }

  const failure = (message: string): PasswordSignInState => ({
    status: "error",
    message,
    fieldErrors: {},
    email: parsed.data.email,
  });

  const rate = checkRateLimit(`open-signup:${await clientKey()}`, 5, 60 * 60 * 1000);
  if (!rate.allowed) {
    return failure("That is a lot of new accounts. Try again in a little while.");
  }

  if (!isSupabaseConfigured()) return failure(GENERIC_ERROR);

  const outcome = await openSignup(parsed.data.email, parsed.data.password);
  if (!outcome.ok) {
    return failure(
      outcome.reason === "already-registered"
        ? "That address already has an account. Sign in instead."
        : GENERIC_ERROR,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // The account exists; the sign-in page will take it from here.
    redirect("/login");
  }

  redirect("/welcome/username");
}

export async function signInWithPassword(
  _previous: PasswordSignInState,
  formData: FormData,
): Promise<PasswordSignInState> {
  const email = text(formData, "email");
  const parsed = passwordSignInSchema.safeParse({
    email,
    password: text(formData, "password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues, ["email", "password"]),
      email,
    };
  }

  const failure = (message: string): PasswordSignInState => ({
    status: "error",
    message,
    fieldErrors: {},
    email: parsed.data.email,
  });

  /*
   * Both buckets are consumed on every attempt, so neither can be sidestepped
   * by varying the other.
   */
  const perClient = checkRateLimit(
    `password-signin:${await clientKey()}`,
    PASSWORD_MAX_ATTEMPTS,
    PASSWORD_WINDOW_MS,
  );
  const perAccount = checkRateLimit(
    `password-signin-email:${parsed.data.email}`,
    PASSWORD_MAX_ATTEMPTS,
    PASSWORD_WINDOW_MS,
  );

  if (!perClient.allowed || !perAccount.allowed) {
    return failure(
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("Password sign-in rejected: Supabase is not configured.");
    return failure(GENERIC_ERROR);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Logged with its real reason, shown with one that reveals nothing.
    console.error("Password sign-in failed", error?.message);
    return failure(BAD_CREDENTIALS);
  }

  // An invited store's first sign-in binds the account to its store, whichever
  // way they came in. Awaited so the destination page sees the membership.
  await claimPendingInvite(data.user);

  redirect(safeNextPath(text(formData, "next")));
}

/**
 * Sends a link for setting a new password.
 *
 * Also how an invited store gets its *first* password: the account exists with
 * none, and Supabase happily sends a recovery link to an account that has
 * never had one, so there is no separate "activate your account" path to
 * build or to get wrong.
 *
 * The response is identical whether or not the address has an account, for the
 * same reason the magic-link form's is.
 */
export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = requestResetSchema.safeParse({ email: text(formData, "email") });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues.find((issue) => issue.path[0] === "email")?.message ??
        "Please enter a valid email address.",
    };
  }

  const rate = checkRateLimit(
    `password-reset:${await clientKey()}`,
    SIGN_IN_MAX,
    SIGN_IN_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  if (!isSupabaseConfigured()) {
    console.error("Password reset rejected: Supabase is not configured.");
    return { status: "error", message: GENERIC_ERROR };
  }

  // Same recovery as the magic link: an address invited before accounts were
  // provisioned at invite time still has no auth user to send anything to.
  await provisionIfInvited(parsed.data.email);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/profile/password")}`,
  });

  if (error) {
    // Logged, not returned: the message distinguishes known from unknown
    // addresses, which is exactly what must not leak.
    console.error("Password reset request failed", error.message);
  }

  return { status: "sent" };
}

/**
 * Sets the signed-in account's password.
 *
 * Reached two ways, and they are the same page: an operator changing a
 * password they already know, and one who has just followed a reset link and
 * therefore has a session but no password.
 *
 * There is no "current password" field. The reset-link arrival has no current
 * password to type, and Supabase's own "secure password change" setting is the
 * right place to require re-authentication — a field here would be a second,
 * weaker copy of that rule that the reset path would have to skip anyway.
 */
export async function updatePassword(
  _previous: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const parsed = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirm: text(formData, "confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues, ["password", "confirm"]),
    };
  }

  if (!isSupabaseConfigured()) {
    console.error("Password update rejected: Supabase is not configured.");
    return { status: "error", message: GENERIC_ERROR, fieldErrors: {} };
  }

  const supabase = await createSupabaseServerClient();

  /*
   * The session is the authorisation. `updateUser` acts on whoever the cookie
   * says you are, so an expired or absent one must stop here rather than
   * producing a confusing failure further in.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "Your sign-in has expired. Please request a new link and try again.",
      fieldErrors: {},
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    console.error("Password update failed", error.message);

    /*
     * Surfaced rather than swallowed. This one is about the password the
     * person just typed, not about any stored secret, so saying so tells an
     * attacker nothing and saves everyone else from a mystery.
     */
    return {
      status: "error",
      message: error.message.match(/password/i)
        ? error.message
        : "That password could not be saved. Please try a different one.",
      fieldErrors: {},
    };
  }

  return { status: "saved" };
}

/**
 * Starts a social sign-in.
 *
 * The provider arrives in a form field, so it is attacker-controlled and is
 * checked against the list this deployment has actually configured. Without
 * that check somebody could start a flow for a provider with no client behind
 * it and land on a Supabase error page.
 *
 * Supabase returns the URL to send the browser to; the existing
 * `/auth/callback` handler finishes the exchange, exactly as it does for a
 * magic link.
 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = text(formData, "provider");
  const nextPath = safeNextPath(text(formData, "next"));

  if (!isProviderEnabled(provider)) {
    console.error(`Rejected a sign-in with an unconfigured provider: ${provider}`);
    redirect("/login?error=provider-unavailable");
  }

  if (!isSupabaseConfigured()) {
    console.error("Social sign-in rejected: Supabase is not configured.");
    redirect("/login?error=unavailable");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error || !data.url) {
    console.error("Could not start the social sign-in", error?.message);
    redirect("/login?error=provider-failed");
  }

  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
