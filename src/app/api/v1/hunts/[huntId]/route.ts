import { z } from "zod";

import { absoluteAvatars } from "@/lib/api/absolute-avatars";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { huntById } from "@/lib/players/hunts";

export const dynamic = "force-dynamic";

/** One hunt, for its own screen: public to anyone signed in, private to its owner. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ huntId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { huntId } = await params;
  if (!z.string().uuid().safeParse(huntId).success)
    return badRequest("huntId is required");

  const hunt = await huntById(huntId, player.playerId);
  if (!hunt) return Response.json({ error: "not-found" }, { status: 404 });

  return Response.json({
    hunt: absoluteAvatars({ ...hunt, yours: hunt.playerId === player.playerId }),
  });
}
