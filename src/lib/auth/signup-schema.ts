import { z } from "zod";

/**
 * Open sign-up's shapes, testable without a server.
 *
 * The TestFlight link is the invitation now - the founder's call - so
 * anyone holding the app or the website can make an account with an
 * email address and a password. The password floor matches the one the
 * invited-player flow has always enforced.
 */

export const PASSWORD_MIN = 8;

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email address does not look right.")
    .max(200),
  password: z
    .string()
    .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters.`)
    .max(200, "That is longer than a password needs to be."),
});

export type SignupState = { status: "idle" } | { status: "error"; message: string };

export const SIGNUP_IDLE: SignupState = { status: "idle" };

/**
 * The starter display name, derived from the address.
 *
 * Sign-up asks for the username on the very next screen, so this only
 * has to be presentable for a minute - but it must satisfy the players
 * table (2 to 40 characters), whatever the address looks like.
 */
export function starterNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 40) : "New Player";
}
