import { z } from "zod";

import { apiPlayer, apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { afterResponse } from "@/lib/after-response";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { roomPhase } from "@/lib/events/schema";
import { CAPTION_MAX, publishPost } from "@/lib/flares/publish";
import { pointFromCoords } from "@/lib/geo/zip";
import { notifyEarlyBoardFlares, notifyRoomFlare } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

/**
 * The composer's one door: publish a Flare of one or many cards.
 *
 * With a room code it goes on that board under the room identity, the
 * same checks the board's own route makes; without one it goes to the
 * area. Either way it is ONE post, and posting three cards makes one
 * item in the Feed with three slides, never three posts.
 */
const schema = z.object({
  code: z.string().trim().optional(),
  intent: z.enum(["want", "showcase"]),
  caption: z.string().trim().max(CAPTION_MAX).nullable().optional(),
  items: z
    .array(
      z.object({
        cardId: z.string().uuid(),
        printingId: z.string().uuid().nullable().optional(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(120),
  hunt: z
    .union([
      z.object({ id: z.string().uuid() }),
      z.object({ name: z.string().trim().min(1).max(60) }),
    ])
    .nullable()
    .optional(),
  acceptsTrade: z.boolean().optional(),
  acceptsCash: z.boolean().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `area-flare:${player.playerId}`,
    LIMITS.areaFlare.limit,
    LIMITS.areaFlare.windowMs,
  );
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised Flare");
  const body = parsed.data;

  let eventId: string | null = null;
  let session: { id: string; displayName: string } | null = null;
  let early = false;

  if (body.code) {
    const code = normalizeJoinCode(body.code);
    if (!isValidJoinCode(code))
      return badRequest("That room code does not look right.");
    const room = await apiSession(request);
    if (!room) return unauthorized();
    const resolved = await resolveCode(code);
    if (resolved.outcome !== "room") {
      return Response.json({ ok: false, error: "not-open" }, { status: 409 });
    }
    const phase = roomPhase(resolved.room, Date.now());
    if (phase !== "live" && phase !== "early") {
      return Response.json({ ok: false, error: "not-open" }, { status: 409 });
    }
    const participation = await findParticipation(resolved.room.id, room.id);
    if (!participation) return unauthorized();
    eventId = resolved.room.id;
    session = { id: room.id, displayName: room.display_name ?? player.displayName };
    early = phase === "early";
  }

  const result = await publishPost({
    playerId: player.playerId,
    session,
    eventId,
    intent: body.intent,
    caption: body.caption ?? null,
    items: body.items.map((item) => ({
      cardId: item.cardId,
      printingId: item.printingId ?? null,
      quantity: item.quantity,
    })),
    hunt: body.hunt ?? null,
    acceptsTrade: body.acceptsTrade ?? true,
    acceptsCash: body.acceptsCash ?? false,
    at: pointFromCoords(body.latitude, body.longitude),
  });

  if (!result.ok) {
    if (result.reason === "hunt-limit") {
      return Response.json(
        {
          ok: false,
          error: "hunt-limit",
          message: `You are keeping ${result.kept} hunts, which is the limit on your plan. Add these cards to one you already have, or finish one first.`,
        },
        { status: 409 },
      );
    }
    if (result.reason === "already-posted") {
      return Response.json(
        { ok: false, error: "already-posted", message: "Those cards are already up." },
        { status: 409 },
      );
    }
    if (result.reason === "empty") return badRequest("Pick a card first.");
    return Response.json({ ok: false, error: "unavailable" }, { status: 500 });
  }

  /* The room hears about it once, as it always has for a batch. */
  if (eventId && session) {
    const roomId = eventId;
    const poster = session;
    if (early && body.intent === "want") void notifyEarlyBoardFlares(roomId);
    afterResponse(() =>
      notifyRoomFlare(
        roomId,
        poster.id,
        poster.displayName,
        body.items.map((item) => item.cardId),
        body.intent,
      ),
    );
  }

  return Response.json({
    ok: true,
    postId: result.postId,
    posted: result.posted,
    huntId: result.huntId,
    atCap: result.atCap,
  });
}
