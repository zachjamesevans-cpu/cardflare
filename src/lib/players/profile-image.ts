/**
 * The rules an uploaded profile picture has to satisfy.
 *
 * Pure and free of server-only imports — the same limits are quoted in
 * the UI, checked in the Server Action and enforced by the storage
 * bucket, and all three should be reading the same numbers.
 *
 * The founder's brief was "keep the image size normal and usual, no
 * crazy upload size", which is what these are: a 2MB ceiling on what may
 * be sent, and a 512px square on what gets stored. 512 is what a retina
 * phone needs for a 128pt avatar and nothing more; the stored file lands
 * around 40KB, so a roster of twelve players costs half a megabyte.
 */

/** The most a client may send. Matches the bucket's file_size_limit. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** What the stored square is re-encoded to, in pixels. */
export const AVATAR_SIZE = 512;

/** Matches the bucket's allowed_mime_types. */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type AvatarCheck = { ok: true } | { ok: false; message: string };

/**
 * Whether a chosen file is worth sending, said in words a player can act
 * on. Convenience only: the Server Action re-checks everything, because
 * a Server Action is a public POST endpoint and this runs on the client.
 */
export function checkAvatarFile(file: { size: number; type: string }): AvatarCheck {
  if (file.size === 0) {
    return { ok: false, message: "That file looks empty. Pick another one." };
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: "That picture is over 2MB. Pick a smaller one, or take a new photo.",
    };
  }

  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Profile pictures need to be a PNG, JPEG or WebP." };
  }

  return { ok: true };
}

/**
 * The object path an avatar is stored at.
 *
 * Keyed on the player and stamped with the time it was written. The
 * stamp is what makes a new picture actually appear: a fixed path would
 * be cached by every CDN and browser between the storage bucket and a
 * phone at a counter, and the player would swear the upload failed.
 */
export function avatarObjectPath(playerId: string, at = Date.now()): string {
  return `${playerId}/${at}.webp`;
}
