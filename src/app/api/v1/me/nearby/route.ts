import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { nearbySettingsFor, setNearbyMatching } from "@/lib/nearby/settings";

export const dynamic = "force-dynamic";

/** The Nearby matching switch, and whether a ZIP is set for it to work. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json(await nearbySettingsFor(player.playerId));
}

export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const body = (await readJsonPayload(request)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return badRequest("enabled is required");

  const saved = await setNearbyMatching(player.playerId, body.enabled);
  if (!saved) return Response.json({ error: "unavailable" }, { status: 503 });

  return Response.json(await nearbySettingsFor(player.playerId));
}
