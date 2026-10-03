import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import {
  addBinderCard,
  firstTradeBinderId,
  readBinder,
  removeBinderCard,
} from "@/lib/binder/binder";
import { addCardSchema, forOldBuild } from "@/app/api/v1/binders/_shared";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** For the app build that still writes to "the" trade binder: the first one up for trade. */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = await firstTradeBinderId(player.playerId);
  if (!id) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = addCardSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("cardId is required");
  const result = await addBinderCard(
    player.playerId,
    player.displayName,
    parsed.data,
    id,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "at-cap" ? 409 : 503 },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId, id);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}

const removeSchema = z.object({ entryId: z.guid() });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = await firstTradeBinderId(player.playerId);
  if (!id) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId is required");
  const result = await removeBinderCard(
    player.playerId,
    player.displayName,
    parsed.data.entryId,
    id,
  );
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId, id);
  return Response.json(absoluteImageUrls({ binder: binder && forOldBuild(binder) }));
}
