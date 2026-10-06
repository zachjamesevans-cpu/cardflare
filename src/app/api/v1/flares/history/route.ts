import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { listFlareHistory } from "@/lib/flares/history";

export const dynamic = "force-dynamic";

/**
 * The app's Flare history: the player's past Flares (found, traded or
 * taken down) with who answered each, for History's Flares filter. The
 * website's History page reads the same `listFlareHistory`.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  return Response.json(
    absoluteImageUrls({ flares: await listFlareHistory(player.playerId) }),
  );
}
