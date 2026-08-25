import "server-only";

import { siteUrl } from "@/lib/site";

/**
 * Every picture path in an API answer, made absolute.
 *
 * A relative `/api/avatars/...` or `/api/card-art/...` is meaningless
 * to a device with no origin to resolve it against, so it draws as
 * initials or an empty frame. Keyed on the FIELD and walked over the
 * whole answer rather than named per item kind — the feed's version of
 * this named kinds, and every new kind that carried a face shipped
 * quietly broken until the founder saw it. A rule on the field cannot
 * be forgotten by the next shape. Shared here so the Local endpoints
 * and the Feed cannot drift apart on it.
 */
export function absoluteImageUrls<T>(value: T): T {
  const base = siteUrl();

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(node as Record<string, unknown>)) {
      out[key] =
        (key === "avatarUrl" || key === "imageUrl" || key === "url") &&
        typeof inner === "string" &&
        inner.startsWith("/")
          ? `${base}${inner}`
          : walk(inner);
    }
    return out;
  };

  return walk(value) as T;
}
