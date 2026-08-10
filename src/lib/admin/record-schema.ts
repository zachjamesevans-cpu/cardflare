import { z } from "zod";

import { displayNameSchema } from "@/lib/players/schema";

/**
 * What an admin may rewrite on somebody else's record, and the shapes it
 * has to arrive in. Free of server-only imports so the rules can be
 * tested without a database, same discipline as every other schema here.
 */

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Please enter an email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Please enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const editStoreSchema = z.object({
  storeId: z.guid(),
  name: z
    .string()
    .trim()
    .min(1, "Please enter the store's name.")
    .max(120, "Please keep the name under 120 characters."),
  /** Where CardFlare writes. Not the same thing as a sign-in address. */
  contactEmail: emailSchema,
  city: optionalText(80),
  region: optionalText(80),
});

export const editPlayerSchema = z.object({
  playerId: z.guid(),
  displayName: displayNameSchema,
});

/** A credential change: whose, and to what. */
export const signInEmailSchema = z.object({
  userId: z.guid(),
  email: emailSchema,
});

export type EditStoreInput = z.infer<typeof editStoreSchema>;
export type EditPlayerInput = z.infer<typeof editPlayerSchema>;

export type RecordEditState =
  | { status: "idle" }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

export const RECORD_EDIT_IDLE: RecordEditState = { status: "idle" };
