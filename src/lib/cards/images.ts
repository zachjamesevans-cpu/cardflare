/**
 * Whether card artwork may be rendered.
 *
 * Two independent gates gate a card image, and both must be open:
 *
 *   1. The provider declared `suppliesImages`, and actually returned a URL.
 *      Enforced at sync time — nothing else can put a value in `image_url`.
 *   2. This flag.
 *
 * Off by default. CardFlare does not own card artwork, and an install that has
 * not made a deliberate decision about it should not be requesting third-party
 * images. When off, no request is made at all — the placeholder is rendered
 * instead, not an <img> that fails.
 *
 * `NEXT_PUBLIC_` because the decision is needed while rendering on the client.
 * It is a display switch, not a secret.
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
export const ALLOWED_IMAGE_HOSTS = ["optcgapi.com", "www.optcgapi.com"] as const;

/**
 * Whether a stored URL is safe to render.
 *
 * Belt and braces over the database's `https://` constraint. A malformed value
 * returns false rather than throwing, because a bad row must not break a
 * search result page.
 */
export function isRenderableImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;

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
