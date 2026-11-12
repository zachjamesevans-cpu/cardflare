import { z } from "zod";

import { handleSchema } from "@/lib/players/handle-schema";
import { displayNameSchema } from "@/lib/players/schema";

/**
 * Open sign-up's shapes, testable without a server.
 *
 * The TestFlight link is the invitation now - the founder's call - so
 * anyone holding the app or the website can make an account with an
 * email address and a password. The password floor matches the one the
 * invited-player flow has always enforced.
 */

import { PASSWORD_MIN } from "./signup-rules";

/*
 * The password floor, the email typo guard and the form's idle state
 * live in signup-rules.ts, which has no zod in it, and are re-exported
 * here so the server keeps one import.
 */
export * from "./signup-rules";

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
