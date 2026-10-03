import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer } from "@/lib/api/auth";
import { nightPlayer } from "@/lib/events/night-matches";

export const dynamic = "force-dynamic";

/**
 * One player as a night sees them, for the app's NightPlayer screen:
 * their matches with the viewer, their Flares here, and their binders
 * up for trade, never a private one. 404 when they are not on the
 * roster. The same `nightPlayer` the website's /e/[code]/p/[playerId]
 * reads. A guest may look; a guest just has no matches.
 */

type Params = { params: Promise<{ eventId: string; playerId: string }> };

const idSchema = z.guid();

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const raw = await params;
  const eventId = idSchema.safeParse(raw.eventId);
  const playerId = idSchema.safeParse(raw.playerId);
  if (!eventId.success || !playerId.success) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const account = await apiPlayer(request);
  const view = await nightPlayer(
    eventId.data,
    playerId.data,
    account?.playerId ?? null,
  );
  if (!view) return Response.json({ error: "not-found" }, { status: 404 });

  /* Faces, binder covers and card art are site-relative paths; a phone
     needs the origin. */
  return Response.json(absoluteImageUrls(view));
}
