import { tierAllows } from "@/lib/tiers";

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

/**
 * The cover banner behind the picture: wide, short, and re-encoded to
 * exactly this box so every profile block lines up. Same 2MB send
 * ceiling as the avatar; the stored file lands around 100KB.
 */
export const COVER_WIDTH = 1200;
export const COVER_HEIGHT = 450;

/** The object path a cover is stored at, beside the avatars. */
export function coverObjectPath(playerId: string, at = Date.now()): string {
  return `covers/${playerId}/${at}.${AVATAR_FORMAT}`;
}

/**
 * Stored as JPEG, and the choice is a diagnosis rather than a taste.
 *
 * Every avatar this feature ever served was WebP, and every one of them
 * failed on the founder's phone while every other image on the site
 * loaded. The system check finally made the shape visible: row, bucket,
 * server read and public route all green, and only the browser's render
 * red. Card art works because Next's optimizer negotiates the format
 * per browser; our route served WebP unconditionally. Some iOS
 * configurations (Lockdown Mode most famously) refuse to decode WebP at
 * all, and no server-side check catches that because servers do not
 * decode. JPEG is decodable by everything that can show a web page.
 */
export const AVATAR_FORMAT = "jpg" as const;

/** Matches the bucket's allowed_mime_types. */
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * Animated avatars: a Pro feature, and a different set of numbers.
 *
 * A GIF is many pictures in one file, so the still ceiling would refuse
 * almost every real one. 8MB in is roughly what a phone's GIF keyboard
 * or a Giphy download weighs; what comes out is squared to the same 512
 * and capped at 60 frames, which is a couple of seconds of a loop and
 * lands well under a megabyte. Anything longer than that is a video
 * wearing a GIF's clothes, and it would cost every person in the room
 * to look at.
 *
 * The frame cap is enforced by DECODING only that many pages rather
 * than by refusing the file, so a long loop is politely shortened
 * instead of rejected.
 */
export const ANIMATED_AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const ANIMATED_AVATAR_MAX_FRAMES = 60;
export const ANIMATED_AVATAR_MIME_TYPES = ["image/gif"] as const;

/** What the re-encoded animation may weigh before it is refused. */
export const ANIMATED_AVATAR_MAX_STORED_BYTES = 3 * 1024 * 1024;

/**
 * The first six bytes of every GIF, and the only thing that decides.
 *
 * A browser's `file.type` comes from the operating system's guess at an
 * extension, so it is a hint and not a fact. The bytes are the fact.
 */
export function looksLikeGif(bytes: Uint8Array): boolean {
  if (bytes.length < 14) return false;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}

/** Where an animated avatar is stored, beside the still it posters. */
export function animatedAvatarObjectPath(playerId: string, at = Date.now()): string {
  return `${playerId}/${at}.gif`;
}

export type AnimatedAvatarCheck = { ok: true } | { ok: false; message: string };

/**
 * Whether a chosen GIF is worth sending. Client-side courtesy only,
 * exactly like `checkAvatarFile`: the Server Action re-checks the size,
 * the type AND the bytes, because it is a public POST endpoint.
 */
export function checkAnimatedAvatarFile(file: {
  size: number;
  type: string;
}): AnimatedAvatarCheck {
  if (file.size === 0) {
    return { ok: false, message: "That file looks empty. Pick another one." };
  }

  if (file.size > ANIMATED_AVATAR_MAX_BYTES) {
    return {
      ok: false,
      message: "That GIF is over 8MB. Pick a shorter or smaller one.",
    };
  }

  if (!(ANIMATED_AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "An animated picture has to be a GIF." };
  }

  return { ok: true };
}

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
  return `${playerId}/${at}.${AVATAR_FORMAT}`;
}

/**
 * The content type an object path should be served with.
 *
 * By extension, never echoed from the client: everything in the bucket
 * was written by `setAvatar`, so the extension is a fact this server
 * created. Old objects are WebP and still served as such; anything
 * unrecognised falls back to JPEG, the format everything decodes.
 */
export function avatarContentType(path: string): string {
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return path.endsWith(".webp") ? "image/webp" : "image/jpeg";
}

/**
 * Which of a player's two pictures to serve.
 *
 * A Pro player with an animation gets the animation; everybody else
 * gets the still, including a player who WAS Pro and is not any more.
 * That is the whole downgrade story, and it is one line rather than a
 * lifecycle: the GIF stays in the bucket, unreferenced by every
 * renderer, and comes back the moment the tier does.
 *
 * Every read of a player's picture goes through here, so no surface
 * has to know what a tier is - the room roster, the profile, the app's
 * API and the search results all just ask for a path.
 */
export function avatarPathFor(row: {
  avatar_url?: string | null;
  avatar_animated?: string | null;
  tier?: string | null;
}): string | null {
  if (row.avatar_animated && tierAllows(row.tier ?? null, "animatedAvatar")) {
    return row.avatar_animated;
  }
  return row.avatar_url ?? null;
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
