import { z } from "zod";

/**
 * Display names are shown to strangers standing in the same room.
 *
 * The bounds match the database constraints exactly, so a name that passes
 * here cannot be rejected by Postgres afterwards. Whitespace is collapsed
 * before length is measured: "Zach          E" is a layout problem, not a
 * 16-character name.
 */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;

/**
 * Characters that do not survive being rendered next to other people's names.
 *
 * Control characters break the row. Bidi overrides are worse: they can make a
 * name display as something other than what is stored, which is impersonation
 * rather than untidiness. Zero-width spaces let two players hold names that
 * look identical.
 *
 * Deliberately not all of `\p{Cf}` — that category contains the zero-width
 * joiner, and excluding it would reject any emoji built from a sequence.
 */
const UNSAFE_CHARACTERS = new RegExp(
  [
    "[",
    "\\p{Cc}", // control characters
    "\\u200B", // zero-width space
    "\\u200E\\u200F", // left/right-to-left marks
    "\\u202A-\\u202E", // bidi embedding and override
    "\\u2066-\\u2069", // bidi isolates
    "\\uFEFF", // byte-order mark
    "]",
  ].join(""),
  "u",
);

export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, `Please use at least ${DISPLAY_NAME_MIN} characters.`)
      .max(DISPLAY_NAME_MAX, `Please keep it under ${DISPLAY_NAME_MAX} characters.`)
      .refine((value) => !UNSAFE_CHARACTERS.test(value), {
        message: "Please use ordinary characters.",
      }),
  );

export const joinAsPlayerSchema = z.object({ displayName: displayNameSchema });

export type JoinAsPlayerInput = z.infer<typeof joinAsPlayerSchema>;

export type JoinPlayerState =
  { status: "idle" } | { status: "error"; message: string; displayName: string };

export const JOIN_PLAYER_IDLE: JoinPlayerState = { status: "idle" };

/** What a page needs to render for a guest, with nothing sensitive in it. */
export interface PlayerIdentity {
  id: string;
  displayName: string;
}
