import { apiPlayer, apiSession } from "@/lib/api/auth";
import { listFeed } from "@/lib/feed/repository";
import { sessionForPlayer } from "@/lib/players/accounts";
import { siteUrl } from "@/lib/site";
import { pointFromCoords } from "@/lib/geo/zip";

export const dynamic = "force-dynamic";

/**
 * The Feed, for a native client.
 *
 * Same `listFeed` the website calls, so the two can never tell different
 * stories about what is on tonight. The only work done here is the seam
 * everything crossing to a phone needs: a relative avatar path is useless to
 * a device with no origin to resolve it against.
 */
export async function GET(request: Request): Promise<Response> {
  const account = await apiPlayer(request);

  /* A guest has no follows and no locals, so there is nothing to derive.
     An empty feed is the honest answer, not an error. */
  if (!account) return Response.json({ items: [] });

  /*
   * The account's room identity, and only as a fallback the token this
   * device happens to hold — an account has exactly one session now, so the
   * first answer is the right one and the second is for the moment before a
   * player has ever joined anything.
   */
  const session =
    (await sessionForPlayer(account.playerId)) ?? (await apiSession(request));

  /*
   * Where the phone is, if its owner granted permission. Query params
   * rather than a stored column, and that is the privacy design rather
   * than a shortcut: the coordinate exists for the length of this
   * request and there is nowhere in the schema to put it. A player who
   * refuses falls back to the ZIP on their profile, which the server
   * reads itself - see originForPlayer.
   */
  const url = new URL(request.url);
  const device = pointFromCoords(
    url.searchParams.get("lat"),
    url.searchParams.get("lng"),
  );

  const items = await listFeed(account.playerId, session?.id ?? null, device);

  return Response.json({ items: items.map(absoluteAvatars) });
}

/**
 * Every profile picture in the answer, made absolute.
 *
 * A relative `/api/avatars/...` is meaningless to a device with no
 * origin to resolve it against, so it draws as initials. This used to
 * name ONE kind - `hunt` - and every other face in the feed was quietly
 * broken on the phone: `added`, `suggest`, and later `recent` and
 * `wanted`. The founder, looking at the deployed feed: "you should be
 * able to see profile pics in the feed. will has a profile pic but it's
 * not visible."
 *
 * So it walks the item instead of naming kinds. A rule keyed on the
 * FIELD cannot be forgotten by the next item that carries a face, which
 * is exactly how this one was forgotten four times.
 */
function absoluteAvatars<T>(value: T): T {
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
