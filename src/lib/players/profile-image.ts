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

/**
 * Where the browser fetches an avatar from.
 *
 * CardFlare's own domain, never the storage host directly, and that is a
 * correction rather than a preference. The first cut pointed an `<img>`
 * straight at the Supabase public URL; the server could fetch it and the
 * founder's phone could not, which is the same shape as the bug that
 * already forced this app's writes into a header — something between a
 * phone on real-world wifi and a third-party host eats the request.
 *
 * Serving from `/api/avatars/...` means the browser only ever talks to
 * the origin it already has open. It also means the bucket does not have
 * to be public for a picture to show up, so "is the bucket public" stops
 * being a thing anybody has to know.
 *
 * Rows written before this change hold a full storage URL, and those are
 * REWRITTEN rather than passed through. The first cut passed them
 * through, reasoning that "the old URLs still work where they work" —
 * which was wrong on its face, because those URLs not working is the
 * entire reason this function exists. The founder's own row was one of
 * them, so the fix shipped and their picture still failed: it tried to
 * load, hit the storage host, and fell back to initials. Anything that
 * looks like this bucket goes through the proxy, whenever it was
 * written.
 */
export function avatarSrc(stored: string | null | undefined): string | null {
  if (!stored) return null;

  const path = objectPathFrom(stored);
  if (!path) return null;

  /* Each segment separately: encodeURIComponent would eat the slash. */
  return `/api/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The object path behind whatever is in the column.
 *
 * Two shapes exist: a bare path (everything written since the proxy
 * landed) and a full public storage URL (everything written before).
 * Both have to resolve, and anything that is neither resolves to null
 * rather than being served — a hand-edited row must not be able to aim
 * the proxy somewhere else.
 *
 * Exported because deleting an old picture needs the same answer, and
 * two functions parsing the same column two ways is how they drift.
 */
export function objectPathFrom(stored: string | null | undefined): string | null {
  if (!stored) return null;

  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    const marker = "/storage/v1/object/public/avatars/";
    const at = stored.indexOf(marker);
    if (at === -1) return null;

    const path = decodeURIComponent(stored.slice(at + marker.length));
    return path && !path.includes("..") && !path.startsWith("/") ? path : null;
  }

  if (stored.includes("..") || stored.startsWith("/")) return null;
  return stored;
}
