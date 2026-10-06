import { apiPlayer, apiSession } from "@/lib/api/auth";
import { guestSampleFeed, listFeed } from "@/lib/feed/repository";
import { sessionForPlayer } from "@/lib/players/accounts";
import { absoluteAvatars } from "@/lib/api/absolute-avatars";
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

  const url = new URL(request.url);
  const device = pointFromCoords(
    url.searchParams.get("lat"),
    url.searchParams.get("lng"),
  );

  /*
   * A guest has no follows and no locals, so there is nothing to derive
   * FOR them, and an empty list was the honest answer. It was also the
   * whole first screen for anybody looking before signing up, App Review
   * included: an app that appears to do nothing. So a guest gets a
   * public, read-only sample of recent area Flares - see
   * guestSampleFeed for what is and is not in it. `guest: true` lets
   * the app draw it as a sample rather than as somebody's feed.
   */
  if (!account) {
    const items = await guestSampleFeed(device).catch(() => []);
    return Response.json({ items: items.map(absoluteAvatars), guest: true });
  }

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
  const items = await listFeed(account.playerId, session?.id ?? null, device);

  return Response.json({ items: items.map(absoluteAvatars) });
}
