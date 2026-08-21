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

/** A decimal degree, or nothing. Blank stays blank; 0 is not a default. */
function coordinate(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) =>
        value === null || (Number.isFinite(value) && value >= min && value <= max),
      `Please enter a ${label} between ${min} and ${max}, or leave it blank.`,
    );
}

export const editStoreSchema = z.object({
  storeId: z.guid(),
  name: z
    .string()
    .trim()
    .min(1, "Please enter the store's name.")
    .max(120, "Please keep the name under 120 characters."),
  /**
   * Where CardFlare writes. Not the same thing as a sign-in address.
   *
   * OPTIONAL, because an unclaimed listing has nobody to write to and
   * requiring one would make the admin invent an address to save a
   * correction to a shop's phone number. Blank is stored as null; a
   * value still has to look like an email.
   */
  contactEmail: z
    .union([emailSchema, z.literal("")])
    .transform((value) => value || null),
  city: optionalText(80),
  region: optionalText(80),
  /*
   * The directory fields.
   *
   * All optional, because a store that predates the directory has never
   * been asked for any of them and editing its name must not demand an
   * address. `contactEmail` is where a discovered listing gets one: an
   * imported store is created with none, and this is how it gets the
   * address CardFlare writes to before anybody claims it.
   */
  addressLine: optionalText(160),
  postalCode: optionalText(20),
  country: optionalText(60),
  phone: optionalText(40),
  website: optionalText(200),
  /*
   * Where it is, which is what makes "2.1 miles away" possible.
   *
   * A store CardFlare already had has no coordinate - nobody was ever
   * asked for one - so a player whose only saved shop is an old customer
   * gets no Nearby section at all, whatever is published around them.
   * This is where that gets fixed by hand until claiming collects it.
   *
   * Blank is null rather than 0: the Gulf of Guinea is a real place and
   * every store with a missing coordinate must not appear to be in it.
   */
  latitude: coordinate(-90, 90, "latitude"),
  longitude: coordinate(-180, 180, "longitude"),
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
