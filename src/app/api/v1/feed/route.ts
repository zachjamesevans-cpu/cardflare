import { apiPlayer, apiSession } from "@/lib/api/auth";
import { listFeed } from "@/lib/feed/repository";
import { sessionForPlayer } from "@/lib/players/accounts";
import { siteUrl } from "@/lib/site";

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

  const items = await listFeed(account.playerId, session?.id ?? null);
  const base = siteUrl();

  return Response.json({
    items: items.map((item) =>
      item.kind === "hunt" && item.avatarUrl?.startsWith("/")
        ? { ...item, avatarUrl: `${base}${item.avatarUrl}` }
        : item,
    ),
  });
}
