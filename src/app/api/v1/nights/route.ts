import { apiPlayer } from "@/lib/api/auth";
import { listNights } from "@/lib/events/nights";
import { pointFromCoords } from "@/lib/geo/zip";
import { originForPlayer } from "@/lib/players/location";

export const dynamic = "force-dynamic";

/**
 * The Nights tab, for a native client. Same `listNights` the website's
 * /nights page calls, so the two cannot disagree about what is on.
 *
 * Where the phone is rides as query params and lives for the length of
 * this request, exactly as the Feed route takes it; a player who did
 * not grant location falls back to the ZIP on their profile. A guest
 * has no follows and no seats, so only the coordinate can place them.
 */
export async function GET(request: Request): Promise<Response> {
  const account = await apiPlayer(request);

  const url = new URL(request.url);
  const device = pointFromCoords(
    url.searchParams.get("lat"),
    url.searchParams.get("lng"),
  );
  const origin = account
    ? (await originForPlayer(account.playerId, device)).point
    : device;

  const nights = await listNights(account?.playerId ?? null, origin);

  return Response.json({ nights });
}
