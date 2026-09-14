import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { binderSessionFor, listHaves } from "@/lib/lists/haves";
import { addToBinder, removeFromBinder, setLocalTrade } from "@/lib/lists/repository";
import { addEntrySchema } from "@/lib/lists/schema";
import { afterHolderChanged } from "@/lib/nearby/matching";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * The account's Have list, for the app's Flare tab.
 *
 * The same binder the room shows, reachable with no room: nearby
 * matching needs a card marked Trade locally before there is a room to
 * mark it in. Private to its owner, as it has always been.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json(absoluteImageUrls({ haves: await listHaves(player.playerId) }));
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = addEntrySchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("cardId and quantity are required");

  const session = await binderSessionFor(player.playerId, player.displayName, true);
  if (!session) return Response.json({ error: "unavailable" }, { status: 503 });

  const result = await addToBinder(session.id, parsed.data);
  if (!result.ok) {
    return Response.json(
      { error: result.reason },
      { status: result.reason === "at-cap" ? 409 : 503 },
    );
  }

  return Response.json({ ok: true });
}

const markSchema = z.object({
  entryId: z.string().uuid(),
  localTrade: z.boolean(),
});

/** Trade locally on or off, for one card. */
export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = markSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId and localTrade are required");

  const session = await binderSessionFor(player.playerId, player.displayName, false);
  if (!session) return Response.json({ error: "not-found" }, { status: 404 });

  const saved = await setLocalTrade(
    parsed.data.entryId,
    session.id,
    parsed.data.localTrade,
  );
  if (!saved) return Response.json({ error: "unavailable" }, { status: 503 });

  if (parsed.data.localTrade) void afterHolderChanged(player.playerId);

  return Response.json({ ok: true });
}

const removeSchema = z.object({ entryId: z.string().uuid() });

export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("entryId is required");

  const session = await binderSessionFor(player.playerId, player.displayName, false);
  if (!session) return Response.json({ error: "not-found" }, { status: 404 });

  const removed = await removeFromBinder(parsed.data.entryId, session.id);
  return Response.json({ ok: removed });
}
