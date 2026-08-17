import { z } from "zod";

import { handleSchema } from "@/lib/players/handle";
import { displayNameSchema } from "@/lib/players/schema";

/**
 * Open sign-up's shapes, testable without a server.
 *
 * The TestFlight link is the invitation now - the founder's call - so
 * anyone holding the app or the website can make an account with an
 * email address and a password. The password floor matches the one the
 * invited-player flow has always enforced.
 */

export const PASSWORD_MIN = 8;

/**
 * Everything an account is made of, asked once.
 *
 * It used to be two fields here and the name on the screen after, with a
 * link between them. The founder walked his own sign-up and reported the
 * seam: "it had me put in my name, set a password, then there was a
 * separate link to choose my username. this should all be on one page."
 *
 * He is right, and the old reasoning — a short form at the door converts
 * better — does not survive contact with what the split actually was: a
 * form, then a success screen, then a LINK, then another form. That is
 * not fewer questions, it is the same questions with a door in the
 * middle of them.
 */
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
  displayName: displayNameSchema,
  handle: handleSchema.shape.handle,
});

export type SignupState = { status: "idle" } | { status: "error"; message: string };

export const SIGNUP_IDLE: SignupState = { status: "idle" };

/**
 * A display name derived from the address.
 *
 * Sign-up asks for a real one now, so this is only used where there is
 * nobody to ask: an account created by an admin invitation, before its
 * owner has ever opened it. It must satisfy the players table (2 to 40
 * characters) whatever the address looks like.
 */
export function starterNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  return cleaned.length >= 2 ? cleaned.slice(0, 40) : "New Player";
}
