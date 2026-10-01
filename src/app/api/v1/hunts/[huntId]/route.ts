import { z } from "zod";

import { absoluteAvatars } from "@/lib/api/absolute-avatars";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { offerOnHunt } from "@/lib/players/hunt-offers";
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

const offerSchema = z.object({
  action: z.literal("offer"),
  lines: z
    .array(
      z.object({
        requestId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99).default(1),
      }),
    )
    .min(1)
    .max(120),
  message: z.string().max(280).default(""),
});

/**
 * "I have these", by request: posted cards become offers on their
 * posts, the rest go to the owner as one direct message. The same
 * `offerOnHunt` the website's action calls.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ huntId: string }> },
): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `offer-feed:${player.playerId}`,
    LIMITS.offer.limit,
    LIMITS.offer.windowMs,
  );
  if (limited) return limited;

  const { huntId } = await params;
  if (!z.string().uuid().safeParse(huntId).success)
    return badRequest("huntId is required");

  const parsed = offerSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("lines are needed");

  const outcome = await offerOnHunt(
    huntId,
    { id: player.playerId, displayName: player.displayName },
    parsed.data.lines,
    parsed.data.message,
  );

  if (!outcome.ok) {
    return Response.json(outcome, { status: 409 });
  }
  return Response.json(outcome);
}
