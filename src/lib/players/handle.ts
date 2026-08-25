import { z } from "zod";

/**
 * A handle: the name a player is FOUND by.
 *
 * Split out from the display name because the two were one column doing
 * two incompatible jobs. The founder's report is the clearest statement
 * of the problem: "I don't think people should be able to have a space
 * on their username. For example, Steven B set up his username as
 * 'Steven B'... if they're gonna do a space it should be an underscore
 * so they can be searched more easily."
 *
 * The suggestion alongside it was Discord's old `Zach#6284`. Discord
 * dropped that in 2023 for the reason that settles it here: a
 * discriminator cannot be said out loud across a shop counter, and a
 * lookup that fails on a mistyped digit is a lookup that does not
 * happen. What Discord replaced it with is this — a chosen, unique,
 * space-free handle, with the display name left free to be anything.
 *
 * Free of server-only imports, so the rules can be unit-tested without a
 * database. `public.handle_from` in the migration mirrors `handleFrom`
 * exactly, and `tests/unit/handle.test.ts` walks the same cases through
 * both statements of it.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Matches the `players_handle_shape` check constraint, character for character. */
export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

/**
 * Turns anything into a candidate handle.
 *
 * Lowercased, because a handle differing only in capitals is not a
 * different handle to any human. Every run of anything else becomes ONE
 * underscore, so "Steven   B" and "Steven B" land in the same place
 * rather than one of them keeping a run of separators nobody can type.
 *
 * Can legitimately return something too short — "!!!" leaves nothing at
 * all — so the caller decides what to do about that rather than being
 * handed an invented string it did not ask for.
 */
export function handleFrom(candidate: string): string {
  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/_+$/g, "");
}

/**
 * Shapes a handle AS IT IS BEING TYPED, which is a different job from
 * `handleFrom` in two ways that both shipped as bugs before this split.
 *
 * A trailing underscore survives, because the person halfway through
 * typing "steven_b" is entitled to see "steven_" on the way there —
 * `handleFrom` strips it (a STORED handle must not end on one) and so a
 * field wired through it could never take an underscore from a keyboard.
 *
 * And there is no fallback. `handleSeedFrom` answers "this name left
 * nothing, invent something" — the right answer for a derivation, and
 * exactly the wrong one for a keystroke: wired to a field it refilled
 * "player" the moment backspacing went below three characters, and the
 * founder found the field impossible to empty. Here, emptied stays
 * empty; too short is the submit button's problem.
 */
export function handleWhileTyping(candidate: string): string {
  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "")
    .slice(0, HANDLE_MAX);
}

/**
 * What a handle lookup can come back with. Lives here rather than with
 * the server-only query so client components can import the type
 * without dragging the admin client toward a bundle.
 */
export type HandleAvailability = "available" | "taken" | "invalid" | "unknown";

/**
 * The fallback when a name derives to nothing usable.
 *
 * Deliberately boring. A handle built from a row id would be unique and
 * unguessable, and a player would have no idea why they were called
 * that; "player" obviously wants changing, which is the correct signal.
 */
export const HANDLE_FALLBACK = "player";

/** A derived handle, or the fallback when the name left nothing behind. */
export function handleSeedFrom(displayName: string): string {
  const derived = handleFrom(displayName);
  return derived.length >= HANDLE_MIN ? derived : HANDLE_FALLBACK;
}

/**
 * The next candidate to try when one is taken.
 *
 * Trims the base so the suffix still fits inside the maximum, which is
 * the part that is easy to get wrong: "a_very_long_name_ind" + "2" is
 * twenty-one characters and the database would refuse it.
 */
export function handleWithSuffix(base: string, position: number): string {
  const suffix = String(position);
  return `${base.slice(0, HANDLE_MAX - suffix.length).replace(/_+$/g, "")}${suffix}`;
}

export const handleSchema = z.object({
  handle: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(
      z
        .string()
        .min(HANDLE_MIN, `Handles are at least ${HANDLE_MIN} characters.`)
        .max(HANDLE_MAX, `Handles are at most ${HANDLE_MAX} characters.`)
        .regex(HANDLE_PATTERN, "Letters, numbers and underscores only. No spaces."),
    ),
});

/** How a handle is written wherever a person reads one. */
export function formatHandle(handle: string): string {
  return `@${handle}`;
}
