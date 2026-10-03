import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer } from "@/lib/api/auth";
import { EMPTY_MATCHES, nightMatches } from "@/lib/events/night-matches";

export const dynamic = "force-dynamic";

/**
 * The viewer's matches at a night, for the app: the same `nightMatches`
 * the website's night page and See all matches read, so the two
 * cannot disagree about who has what. A guest gets the empty answer,
 * not an error: the screen draws the sign-in pitch where the matches
 * would be.
 */

type Params = { params: Promise<{ eventId: string }> };

const eventIdSchema = z.guid();

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const id = eventIdSchema.safeParse((await params).eventId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const account = await apiPlayer(request);
  if (!account) return Response.json(EMPTY_MATCHES);

  const matches = await nightMatches(id.data, account.playerId);

  /* Faces and card art are site-relative paths; a phone needs the origin. */
  return Response.json(absoluteImageUrls(matches));
}
