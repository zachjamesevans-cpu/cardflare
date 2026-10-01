import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { forgetFeed } from "@/lib/feed/memo";
import {
  blockPlayer,
  listBlocked,
  reportTarget,
  unblockPlayer,
} from "@/lib/players/safety";

export const dynamic = "force-dynamic";

/**
 * Report and block, for the app. One endpoint, one discriminated
 * action, the same lib the website's actions call.
 */
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("block"), playerId: z.guid() }),
  z.object({ action: z.literal("unblock"), playerId: z.guid() }),
  z.object({
    action: z.literal("report"),
    kind: z.enum(["post", "player", "thread"]),
    targetId: z.guid(),
    reason: z.enum(["spam", "scam", "harassment", "other"]),
    note: z.string().max(500).optional(),
  }),
]);

/** The people this player has blocked, for the settings screen. */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json({ blocked: await listBlocked(player.playerId) });
}

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `safety:${player.playerId}`,
    LIMITS.follow.limit,
    LIMITS.follow.windowMs,
  );
  if (limited) return limited;

  const parsed = actionSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised safety action");
  const body = parsed.data;

  if (body.action === "block" || body.action === "unblock") {
    if (body.playerId === player.playerId) return badRequest("That is you.");
    const done =
      body.action === "block"
        ? await blockPlayer(player.playerId, body.playerId)
        : await unblockPlayer(player.playerId, body.playerId);
    forgetFeed(player.playerId);
    return done
      ? Response.json({ ok: true })
      : Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  const result = await reportTarget(
    player.playerId,
    body.kind,
    body.targetId,
    body.reason,
    (body.note ?? "").trim() || null,
  );
  if (!result.ok) {
    const status =
      result.reason === "not-found" ? 404 : result.reason === "yourself" ? 400 : 503;
    return Response.json({ ok: false, error: result.reason }, { status });
  }
  return Response.json({ ok: true });
}
