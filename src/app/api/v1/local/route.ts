import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { pointFromCoords } from "@/lib/geo/zip";
import { localFeed, saveLocalRadius } from "@/lib/local/feed";
import { LOCAL_RADII } from "@/lib/local/shared";

export const dynamic = "force-dynamic";

/**
 * The Local tab: every open Flare posted at a store near the player.
 *
 * Coordinates arrive as query parameters when the phone has permission,
 * ride this one request, and are never stored — the location arc's
 * standing rule. Without them the profile ZIP's centroid answers, and
 * with neither the response says "none" so the client shows the ask
 * instead of an empty room.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const url = new URL(request.url);
  const device = pointFromCoords(
    url.searchParams.get("lat"),
    url.searchParams.get("lng"),
  );

  const feed = await localFeed(player.playerId, device);
  return Response.json(absoluteImageUrls(feed));
}

const radiusSchema = z.object({
  radius: z
    .number()
    .int()
    .refine((value): value is (typeof LOCAL_RADII)[number] =>
      (LOCAL_RADII as readonly number[]).includes(value),
    ),
});

/** Saves how far Local reaches. The list of choices is the contract. */
export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = radiusSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) {
    return badRequest(`radius must be one of ${LOCAL_RADII.join(", ")}`);
  }

  const saved = await saveLocalRadius(player.playerId, parsed.data.radius);
  return Response.json({ ok: saved });
}
