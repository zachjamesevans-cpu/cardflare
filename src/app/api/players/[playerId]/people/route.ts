import { apiPlayer } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import {
  listFollowers,
  listFollowing,
  type FollowedPlayer,
} from "@/lib/players/follows";
import { getPlayerSession } from "@/lib/players/session";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Repo-shipped pictures, made fetchable by a client with no origin. */
function absolute(people: FollowedPlayer[]) {
  return people.map((person) => ({
    ...person,
    avatarUrl: person.avatarUrl?.startsWith("/")
      ? `${siteUrl()}${person.avatarUrl}`
      : person.avatarUrl,
  }));
}

/**
 * Who a player follows and who follows them: the lists behind the two
 * numbers on somebody else's profile, the way Instagram opens them.
 *
 * Who may ask is exactly who may ask for the profile itself (see the
 * route above this one): a signed-in account, a guest in a room, or
 * the app's bearer token. Nothing here is more than the room already
 * shows, and the "Trade partners" mark is relative to the player whose
 * lists these are, not to the viewer.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;

  const viewer = await getViewer();
  if (
    viewer.kind === "anonymous" &&
    !(await getPlayerSession()) &&
    !(await apiPlayer(request))
  ) {
    return Response.json({ error: "Join a room first." }, { status: 401 });
  }

  const [followers, following] = await Promise.all([
    listFollowers(playerId),
    listFollowing(playerId),
  ]);

  return Response.json({
    followers: absolute(followers),
    following: absolute(following),
  });
}
