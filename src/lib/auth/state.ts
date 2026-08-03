import type { NewPasswordFieldErrors, SignInFieldErrors } from "./schema";

/**
 * Results of the auth forms.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — a constant or a type alias there is a build error.
 */

/** Requesting a magic link. */
export type SignInState =
  { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

export const SIGN_IN_IDLE: SignInState = { status: "idle" };

/**
 * Signing in with a password.
 *
 * The submitted email is carried back so a rejected attempt does not make
 * somebody retype it; the password never is.
 */
export type PasswordSignInState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors: SignInFieldErrors;
      email: string;
    };

export const PASSWORD_SIGN_IN_IDLE: PasswordSignInState = { status: "idle" };

/** Asking for a reset link. Success is deliberately indistinguishable. */
export type ResetRequestState =
  { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

export const RESET_REQUEST_IDLE: ResetRequestState = { status: "idle" };

/** Choosing a new password. */
export type NewPasswordState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; message: string; fieldErrors: NewPasswordFieldErrors };

export const NEW_PASSWORD_IDLE: NewPasswordState = { status: "idle" };
