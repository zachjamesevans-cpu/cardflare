import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { tradersNearYou } from "@/lib/nearby/traders";
import { uiExperimentEnabled } from "@/lib/ui-experiment";

export const dynamic = "force-dynamic";

/**
 * Traders near you (the UI experiment): opted-in players near the
 * viewer, each with how many cards they have up for trade and how many
 * of those the viewer is hunting. `lat`/`lng` are this phone's position
 * for this one request, never stored; without them, the viewer's ZIP.
 * `radius` is 10/25/50/100 miles, `game` a catalogue slug, `matching=1`
 * keeps only people with a card you hunt.
 *
 * 404 when CARDFLARE_UI_EXPERIMENT=0 (src/lib/ui-experiment.ts).
 */
export async function GET(request: Request): Promise<Response> {
  if (!uiExperimentEnabled()) return new Response("Not found", { status: 404 });

  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const params = new URL(request.url).searchParams;
  const radius = Number(params.get("radius"));
  const game = params.get("game");

  return Response.json(
    absoluteImageUrls(
      await tradersNearYou(player.playerId, {
        latitude: params.get("lat"),
        longitude: params.get("lng"),
        radius: Number.isFinite(radius) && radius > 0 ? radius : null,
        game: game && /^[a-z-]{2,32}$/.test(game) ? game : null,
        matchingOnly: params.get("matching") === "1",
      }),
    ),
  );
}
