import { isHostedCardArt } from "./art-storage";

/**
 * Whether card artwork may be rendered.
 *
 * Two independent gates gate a card image, and both must be open:
 *
 *   1. The provider declared `suppliesImages`, and actually returned a URL.
 *      Enforced at sync time — nothing else can put a value in `image_url`.
 *   2. This flag.
 *
 * Unset means off, so an install that has not made a deliberate decision about
 * third-party artwork does not request any. When off, no request is made at
 * all — the placeholder is rendered instead, not an <img> that fails.
 *
 * `NEXT_PUBLIC_` because the decision is needed while rendering on the client.
 * It is a display switch, not a secret. Inlined at build time, so changing it
 * requires a rebuild.
 */
export function cardImagesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES === "true";
}

/**
 * Hosts whose images may be rendered.
 *
 * Mirrors `remotePatterns` in next.config.ts and exists so a URL that somehow
 * reached the database from elsewhere cannot be rendered. Kept as narrow as
 * practical: an allow-list, never a wildcard.
 */
export const ALLOWED_IMAGE_HOSTS = [
  "optcgapi.com",
  "www.optcgapi.com",
  /* The four public catalogues' picture hosts. Listed by hand rather
     than imported from the provider registry, because this file ships
     to the browser and the registry drags the adapters with it;
     tests/unit/catalogue-providers.test.ts holds the two lists equal. */
  "cards.scryfall.io",
  "assets.tcgdex.net",
  "legendstory-production-s3-public.s3.amazonaws.com",
  "storage.googleapis.com",
  "cmsassets.rgpub.io",
] as const;

/**
 * Whether a stored URL is safe to render.
 *
 * Belt and braces over the database's constraint. A malformed value returns
 * false rather than throwing, because a bad row must not break a search
 * result page.
 *
 * Two legal shapes, and they are checked by different rules because they are
 * different kinds of thing. An absolute URL is a third-party reference and
 * has to name an allow-listed host over https. A `/api/card-art/...` path is
 * not a reference to anywhere — it is this application's own route, serving
 * a file out of our own bucket, and there is no host to allow-list.
 *
 * The hosted form is tested FIRST and by `isHostedCardArt`, which rejects
 * `..` explicitly. Relying on `new URL()` to reason about a relative path
 * would be the mistake here: without a base it throws, and with one it would
 * happily resolve traversal.
 */
export function isRenderableImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;

  if (url.startsWith("/")) return isHostedCardArt(url);

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Alt text for a card image. Never decorative — it identifies the card. */
export function cardImageAlt(exactName: string, cardNumber: string): string {
  return `${exactName} (${cardNumber})`;
}
