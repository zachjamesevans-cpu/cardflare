import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { checkMilestones } from "@/lib/players/milestones";

export const dynamic = "force-dynamic";

/**
 * Milestones: pays anything newly reached, then lists every milestone
 * with its progress and the badge tiers' packs (lib/players/milestones).
 * Cookie or bearer alike, like the packs route, so the website and the
 * app share one door.
 */

async function viewerPlayerId(request: Request): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind !== "anonymous") {
    return (await playerForUser(viewer.user.id))?.id ?? null;
  }
  return (await apiPlayer(request))?.playerId ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const me = await viewerPlayerId(request);
  if (!me) return unauthorized();
  return Response.json(await checkMilestones(me));
}
