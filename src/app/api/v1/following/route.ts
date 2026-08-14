import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { listFollowing } from "@/lib/players/follows";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The app's People list: who the signed-in player follows. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const following = await listFollowing(player.playerId);

  return Response.json({
    following: following.map((person) => ({
      ...person,
      avatarUrl: person.avatarUrl?.startsWith("/")
        ? `${siteUrl()}${person.avatarUrl}`
        : person.avatarUrl,
    })),
  });
}
