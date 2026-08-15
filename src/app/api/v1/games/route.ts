import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { TCG_GAMES } from "@/lib/players/games-catalog";
import { listPlayerGames, setPlayerGames } from "@/lib/players/games";

export const dynamic = "force-dynamic";

/**
 * The games question, for the app: GET is the choices with the player's
 * current answers ticked, POST replaces the answers. The same catalogue
 * and the same storage the website's sign-up step uses, so the two
 * surfaces cannot drift.
 */

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json({
    choices: TCG_GAMES,
    mine: await listPlayerGames(player.playerId),
  });
}

const schema = z.object({
  games: z
    .array(z.enum(["one-piece", "riftbound", "lorcana", "mtg", "pokemon"]))
    .max(TCG_GAMES.length),
});

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised games");

  const saved = await setPlayerGames(player.playerId, parsed.data.games);
  if (!saved) {
    return Response.json({ error: "could-not-save" }, { status: 500 });
  }

  return Response.json({ ok: true, mine: parsed.data.games });
}
