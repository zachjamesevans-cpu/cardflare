/**
 * Where CardFlare's own card art lives, and what it is called.
 *
 * Free of server-only imports so the path rules can be unit-tested, and
 * so the admin's browser can build the same paths it is about to upload
 * to without pulling the service-role client anywhere near a bundle.
 */

/** The bucket created by 20260919090000_card_art_uploads.sql. */
export const CARD_ART_BUCKET = "card-art";

/** The route that serves it. Mirrored in the database's check constraint. */
export const CARD_ART_ROUTE = "/api/card-art";

/** What the importer will accept and what the bucket will hold. */
export const CARD_ART_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Matches the bucket's own ceiling. A card scan is a fraction of this. */
export const CARD_ART_MAX_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The file extension for a mime type, or null if we do not store it. */
export function cardArtExtension(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

/**
 * The content type to serve an object back as, read from its name.
 *
 * From the extension rather than from a stored column: the object path
 * is the only thing the serving route is given, and a lookup to learn a
 * mime type would put a database round trip in front of every cache
 * miss. Unknown extensions fall back to png, which the importer's
 * allow-list makes unreachable.
 */
export function cardArtContentType(objectPath: string): string {
  const extension = objectPath.slice(objectPath.lastIndexOf(".") + 1).toLowerCase();

  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  return "image/png";
}

/**
 * Where one card's art is stored.
 *
 * `<provider>/<set>/<number>.<ext>` — flat enough to browse in the
 * Supabase console and specific enough that two providers' takes on the
 * same card cannot collide. The card number is in the name deliberately:
 * an object nobody can trace back to a card is an object nobody dares
 * delete.
 *
 * Every part is squeezed into the same character class the serving route
 * and the database constraint both enforce, so a set code with a slash
 * or a space in it becomes a legal name rather than a broken path.
 */
function safeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 60);
}

/** The folder one set's art lives in, e.g. `kaizoku/op17`. */
export function cardArtFolder(providerKey: string, setCode: string): string {
  return `${safeSegment(providerKey).toLowerCase()}/${safeSegment(setCode).toLowerCase()}`;
}

/**
 * A card's file name without its extension.
 *
 * Separate from the full path because the two are needed apart: the
 * upload builds a path, and the write-rows step matches what is already
 * in the bucket against what the manifest expects. Matching on the stem
 * rather than the whole name means the row does not have to know
 * whether the picture arrived as a png or a webp.
 */
export function cardArtStem(cardNumber: string): string {
  return safeSegment(cardNumber);
}

export function cardArtObjectPath(input: {
  providerKey: string;
  setCode: string;
  cardNumber: string;
  extension: string;
}): string {
  return [
    cardArtFolder(input.providerKey, input.setCode),
    `${cardArtStem(input.cardNumber)}.${safeSegment(input.extension).toLowerCase()}`,
  ].join("/");
}

/** The value that goes in `card_printings.image_url` for hosted art. */
export function cardArtSrc(objectPath: string): string {
  return `${CARD_ART_ROUTE}/${objectPath}`;
}

/**
 * Whether a stored value points at art we host.
 *
 * The same shape the database check enforces, restated here because a
 * value can reach a renderer from a row written before the constraint
 * existed. `..` is excluded separately from the character class for the
 * reason the migration records: a dot is needed for the extension, so a
 * class that admits one admits two.
 */
export function isHostedCardArt(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.includes("..")) return false;

  return new RegExp(`^${CARD_ART_ROUTE}/[A-Za-z0-9._/-]+$`).test(url);
}
