import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { readBinder, saveBinderSettings } from "@/lib/binder/binder";
import { isBinderCover, isBinderLayout } from "@/lib/binder/covers";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Your own trade binder, for the app: the cards and the settings in
 * one read, the settings in one write. The cards themselves are added
 * and removed at /api/v1/binder/cards.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const binder = await readBinder(player.playerId, player.playerId);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder }));
}

const settingsSchema = z.object({
  isPublic: z.boolean().optional(),
  layout: z.custom<2 | 3>(isBinderLayout).optional(),
  cover: z.custom<string>(isBinderCover).optional(),
  frontEntryId: z.guid().nullable().optional(),
});

export async function PATCH(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const parsed = settingsSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("isPublic, layout, cover or frontEntryId");
  const patch = parsed.data;
  await saveBinderSettings(player.playerId, {
    ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
    ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
    ...(patch.cover !== undefined && isBinderCover(patch.cover)
      ? { cover: patch.cover }
      : {}),
    ...(patch.frontEntryId !== undefined ? { frontEntryId: patch.frontEntryId } : {}),
  });
  const binder = await readBinder(player.playerId, player.playerId);
  if (!binder) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder }));
}
