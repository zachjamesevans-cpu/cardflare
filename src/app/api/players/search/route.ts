import { apiPlayer } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { searchPlayersByName } from "@/lib/players/search";
import { getPlayerSession } from "@/lib/players/session";
import { siteUrl } from "@/lib/site";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { clientKey } from "@/lib/request-context";

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
  const api = await apiPlayer(request);
  if (viewer.kind === "anonymous" && !(await getPlayerSession()) && !api) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }

  const limited = tooMany(
    `player-search:${await clientKey()}`,
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  );
  if (limited) return limited;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  /* The signed-in player searching, so a block hides each from the
     other here too. A guest in a room has blocked nobody. */
  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind !== "anonymous"
        ? ((await playerForUser(viewer.user.id))?.id ?? null)
        : (api?.playerId ?? null);
  const players = await searchPlayersByName(query, me);

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
