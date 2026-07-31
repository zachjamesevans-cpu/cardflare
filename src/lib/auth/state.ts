/**
 * Result of a sign-in attempt.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions — a constant there is a build error.
 */
export type SignInState =
  { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

export const SIGN_IN_IDLE: SignInState = { status: "idle" };
