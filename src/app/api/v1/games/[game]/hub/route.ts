import { gameHub } from "@/lib/cards/game-hub";
import { GAME_SLUGS } from "@/lib/players/games-catalog";

/**
 * A game's hub (src/lib/cards/game-hub.ts): most hunted, price moves this
 * week, most searched. Public, like the card pages it leads to, and held
 * at the edge for an hour: everyone sees the same hub, so it is worked out
 * at most once an hour per game, whoever asks.
 */
type Params = { params: Promise<{ game: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { game } = await params;
  if (!(GAME_SLUGS as readonly string[]).includes(game)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const hub = await gameHub(game);
  return Response.json(
    { hub },
    {
      headers: {
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
