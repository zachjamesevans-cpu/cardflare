/**
 * What counts as a Rive file, decided without a database.
 *
 * Free of server-only imports so the rules are unit-testable, the same
 * discipline as the waitlist form data and the catalogue schema. The
 * upload route calls this before anything touches storage: a file that
 * is not a .riv must be refused at the door rather than stored and
 * discovered later by a player looking at an empty tile.
 */

/** Four megabytes. A profile ornament that big is already too big. */
export const RIVE_MAX_BYTES = 4_000_000;

/**
 * Every .riv file begins with the ASCII fingerprint "RIVE".
 *
 * Checked on the bytes rather than the file name, because a name is a
 * claim and the first four bytes are a fact.
 */
export function looksLikeRive(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x56 && // V
    bytes[3] === 0x45 // E
  );
}

export type RiveRejection = "empty" | "too-big" | "not-rive";

/** Null when the file is fine, otherwise why it was refused. */
export function checkRiveFile(bytes: Uint8Array): RiveRejection | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > RIVE_MAX_BYTES) return "too-big";
  if (!looksLikeRive(bytes)) return "not-rive";
  return null;
}

/** What the console says when a file is refused. */
export const RIVE_REJECTION_COPY: Record<RiveRejection, string> = {
  empty: "That file was empty. Pick the .riv file and try again.",
  "too-big": "That file is over 4 MB. Export it smaller and try again.",
  "not-rive":
    "That is not a Rive file. Export from Rive as .riv, not .rev or an image.",
};
