import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { listFollowers } from "@/lib/players/follows";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Who follows the signed-in player: the Profile tab's Followers list. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const followers = await listFollowers(player.playerId);

  return Response.json({
    followers: followers.map((person) => ({
      ...person,
      avatarUrl: person.avatarUrl?.startsWith("/")
        ? `${siteUrl()}${person.avatarUrl}`
        : person.avatarUrl,
    })),
  });
}
