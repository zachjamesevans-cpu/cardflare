import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { wantedNearYou } from "@/lib/nearby/matching";
import { isWantedSort } from "@/lib/nearby/shared";

export const dynamic = "force-dynamic";

/**
 * "Wanted near you": a page of the holder's cards, each with everybody
 * near them who wants it. `sort` is most, closest or newest; `offset`
 * is the `nextOffset` of the page before. Read live every time, so an
 * ask taken down is not on the next page or the next pull.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const params = new URL(request.url).searchParams;
  const sort = params.get("sort");
  const offset = Math.max(0, Math.floor(Number(params.get("offset") ?? 0)) || 0);

  return Response.json(
    absoluteImageUrls(
      await wantedNearYou(player.playerId, isWantedSort(sort) ? sort : "most", offset),
    ),
  );
}
