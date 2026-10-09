import { z } from "zod";

import { apiPlayer } from "@/lib/api/auth";
import { storePicker } from "@/lib/events/store-days";

export const dynamic = "force-dynamic";

/**
 * The plan-a-visit picker's stores, from the app: the ones the player
 * follows, then the ones near them. The app may send its position for
 * "near"; it is used for this answer and not kept. Search is the
 * existing /api/v1/stores/search.
 */

const coordinate = z.coerce.number().finite();

export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  const url = new URL(request.url);
  const lat = coordinate.min(-90).max(90).safeParse(url.searchParams.get("lat"));
  const lng = coordinate.min(-180).max(180).safeParse(url.searchParams.get("lng"));
  const device =
    lat.success && lng.success ? { latitude: lat.data, longitude: lng.data } : null;
  return Response.json({ picker: await storePicker(player?.playerId ?? null, device) });
}
