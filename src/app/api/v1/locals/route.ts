import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { listRecentStores, removeLocal, saveLocal } from "@/lib/players/locals";

export const dynamic = "force-dynamic";

/**
 * Following and forgetting a store, from the app.
 *
 * Joining a room signed in still saves the store on its own; POST is
 * the Follow button on a store's page and in a room, the website's
 * `followStoreAction`. Scoped to the authenticated player; nobody
 * edits anyone else's locals.
 *
 * GET is the Room tab's first screen: the stores they have been in,
 * most recent first, then the ones they only follow. Its own call
 * rather than more of `/me`, which the home screen reads on every open.
 */

const localSchema = z.object({ storeId: z.string().uuid() });

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const stores = await listRecentStores(player.playerId);
  return Response.json({
    stores: stores.map((store) => ({
      storeId: store.storeId,
      name: store.name,
      city: store.city,
      region: store.region,
      code: store.joinCode,
      liveNow: store.liveNow,
      nextEventAt: store.nextEventAt,
      nextEventName: store.nextEventName,
      nextEventCode: store.nextEventCode,
      earlyOpen: store.earlyOpen,
      walkIn: store.walkIn,
      visitedAt: store.visitedAt,
      following: store.following,
    })),
  });
}

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
