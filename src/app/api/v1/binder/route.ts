import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { firstTradeBinderId, readBinder } from "@/lib/binder/binder";
import { forOldBuild } from "@/app/api/v1/binders/_shared";

export const dynamic = "force-dynamic";

/**
 * For the app build that still asks for "the" trade binder: the first
 * binder up for trade. Settings are written through /api/v1/binders
 * now; this answers reads only, and PATCH answers with the binder
 * unchanged so the old screen does not error.
 */
async function theTradeBinder(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = await firstTradeBinderId(player.playerId);
  const binder = id ? await readBinder(player.playerId, player.playerId, id) : null;
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder: forOldBuild(binder) }));
}

export async function GET(request: Request): Promise<Response> {
  return theTradeBinder(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return theTradeBinder(request);
}
