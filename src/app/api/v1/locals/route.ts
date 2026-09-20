import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { removeLocal, saveLocal } from "@/lib/players/locals";

export const dynamic = "force-dynamic";

/**
 * Following and forgetting a store, from the app.
 *
 * Joining a room signed in still saves the store on its own; POST is
 * the Follow button on a store's page and in a room, the website's
 * `followStoreAction`. Listing rides on `/me`. Scoped to the
 * authenticated player; nobody edits anyone else's locals.
 */

const localSchema = z.object({ storeId: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = localSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("storeId must be a uuid");

  await saveLocal(player.playerId, parsed.data.storeId);
  return Response.json({ ok: true, following: true });
}

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = localSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("storeId must be a uuid");

  await removeLocal(player.playerId, parsed.data.storeId);
  return Response.json({ ok: true, following: false });
}
