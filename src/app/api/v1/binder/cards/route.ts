import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { addBinderCard, readBinder, removeBinderCard } from "@/lib/binder/binder";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** The cards in your binder: one in, one out. Each answers with the whole binder. */

const addSchema = z.object({
  cardId: z.guid(),
  printingId: z.guid().nullable().optional().default(null),
  quantity: z.number().int().min(1).max(99).optional().default(1),
});

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = addSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("cardId is required");
  const result = await addBinderCard(player.playerId, player.displayName, parsed.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "at-cap" ? 409 : 503 },
    );
  }
  const binder = await readBinder(player.playerId, player.playerId);
  return Response.json(absoluteImageUrls({ binder }));
}

const removeSchema = z.object({ entryId: z.guid() });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId is required");
  const result = await removeBinderCard(player.playerId, parsed.data.entryId);
  if (!result.ok) return Response.json({ error: result.reason }, { status: 404 });
  const binder = await readBinder(player.playerId, player.playerId);
  return Response.json(absoluteImageUrls({ binder }));
}
