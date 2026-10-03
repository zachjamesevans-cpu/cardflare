import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { firstTradeBinderId, readBinder, saveBinderOrder } from "@/lib/binder/binder";
import { forOldBuild } from "@/app/api/v1/binders/_shared";
import { z } from "zod";

export const dynamic = "force-dynamic";

const orderSchema = z.object({ entryIds: z.array(z.guid()).max(400) });

/** For the app build that still orders "the" trade binder: the first one up for trade. */
export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = await firstTradeBinderId(player.playerId);
  if (!id) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = orderSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryIds is required");
  const result = await saveBinderOrder(player.playerId, parsed.data.entryIds, id);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 503 });
  const binder = await readBinder(player.playerId, player.playerId, id);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}
