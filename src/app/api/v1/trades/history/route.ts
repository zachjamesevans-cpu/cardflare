import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { ownProfile } from "@/lib/players/profile";
import { listTradeHistory } from "@/lib/trades/history";

export const dynamic = "force-dynamic";

/**
 * The app's trade history: the same list the website's /profile/trades
 * reads, gated the same way. A free player gets the counts and
 * `locked: true` with no rows, so the phone has nothing to blur but
 * a stand-in.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const profile = await ownProfile(player.playerId);
  const history = await listTradeHistory(player.playerId, profile?.tier ?? null);

  return Response.json({ history });
}
