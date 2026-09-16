import { siteUrl } from "@/lib/site";

/**
 * Every picture in an answer, made absolute for a phone.
 *
 * A relative `/api/avatars/...` is meaningless to a device with no
 * origin to resolve it against, so it draws as initials. This used to
 * live in the Feed route and name ONE kind - `hunt` - and every other
 * face in the feed was quietly broken on the phone: `added`, `suggest`,
 * and later `recent` and `wanted`. The founder, looking at the deployed
 * feed: "you should be able to see profile pics in the feed. will has a
 * profile pic but it's not visible." Then the post screen, which had
 * its own route and forgot the rule entirely.
 *
 * So it walks the value instead of naming kinds, and lives here so
 * every app route that carries a face runs it. A rule keyed on the
 * FIELD cannot be forgotten by the next item that carries a face.
 */
export function absoluteAvatars<T>(value: T): T {
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
