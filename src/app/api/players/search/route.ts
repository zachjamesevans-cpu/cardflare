import { apiPlayer } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import { searchPlayersByName } from "@/lib/players/search";
import { getPlayerSession } from "@/lib/players/session";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Player search, for the People card on both clients.
 *
 * Who may ask: the same audience as the profile popup - a signed-in
 * account, a room guest session, or the app's bearer. No credentials
 * at all gets a 401, so this is not an open directory of players.
 */
export async function GET(request: Request): Promise<Response> {
  const viewer = await getViewer();
  if (
    viewer.kind === "anonymous" &&
    !(await getPlayerSession()) &&
    !(await apiPlayer(request))
  ) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const players = await searchPlayersByName(query);

  return Response.json({
    players: players.map((player) => ({
      ...player,
      /* Absolute, because the app has no origin to resolve against. */
      avatarUrl: player.avatarUrl?.startsWith("/")
        ? `${siteUrl()}${player.avatarUrl}`
        : player.avatarUrl,
    })),
  });
}
