import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { removeLocal } from "@/lib/players/locals";

export const dynamic = "force-dynamic";

/**
 * Forgetting a saved store, from the app. Saving needs no endpoint —
 * joining a room signed in does it — and listing rides on `/me`, so
 * removal is the only verb here. Scoped to the authenticated player;
 * nobody edits anyone else's locals.
 */

const removeSchema = z.object({ storeId: z.string().uuid() });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("storeId must be a uuid");

  await removeLocal(player.playerId, parsed.data.storeId);
  return Response.json({ ok: true });
}
