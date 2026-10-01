import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { roomPhase } from "@/lib/events/schema";
import { notifyEarlyBoardFlares, notifyRoomFlare } from "@/lib/notifications/notify";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { restoreFlares, withdrawRoomFlare } from "@/lib/flares/withdraw";
import { addFlare, cancelFlare } from "@/lib/lists/repository";
import { announceShowcase } from "@/lib/lists/showcase";
import { keepShowcaseAsHave } from "@/lib/nearby/showcase";
import { acceptsSchema, addEntrySchema } from "@/lib/lists/schema";
import { saveWant } from "@/lib/players/wants";
import { afterResponse } from "@/lib/after-response";

export const dynamic = "force-dynamic";

/**
 * Posting a Flare from the app. The whole chain is re-established here —
 * session token, room, membership — because this is a public endpoint,
 * exactly as the website's Server Action re-establishes it. A linked
 * account gets the same auto-saved want the website gives it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normalizeJoinCode(decodeURIComponent((await params).code));
  if (!isValidJoinCode(code)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") {
    return Response.json({ error: "not-open" }, { status: 409 });
  }
  const session = await apiSession(request, resolved.room.id);
  if (!session) return unauthorized();

  // Live rooms and early boards both take Flares; nothing else does.
  const flarePhase = roomPhase(resolved.room, Date.now());
  if (flarePhase !== "live" && flarePhase !== "early") {
    return Response.json({ error: "not-open" }, { status: 409 });
  }

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return unauthorized();

  const payload = await readJsonPayload(request);

  const parsed = addEntrySchema.safeParse(payload);
  if (!parsed.success) return badRequest("cardId and quantity are required");

  /*
   * Direction and terms, parsed the same way the website's Server Action
   * parses them so the two surfaces cannot drift. Both are optional: an
   * older build of the app sends neither and posts a plain want, which
   * is exactly what it has always posted.
   */
  const intent =
    (payload as { intent?: unknown }).intent === "showcase" ? "showcase" : "want";
  const acceptsParsed = acceptsSchema.safeParse(payload ?? {});
  const accepts = acceptsParsed.success
    ? acceptsParsed.data
    : { acceptsTrade: true, acceptsCash: false };

  const result = await addFlare(
    resolved.room.id,
    session.id,
    parsed.data,
    intent,
    accepts,
  );
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  // The first Flares on an early board wake the store's regulars. A
  // showcase is not a hunt, so it does not count towards that.
  if (flarePhase === "early" && intent === "want") {
    void notifyEarlyBoardFlares(resolved.room.id);
  }

  // Everyone in the room hears about it, exactly as the website's
  // Server Action does - one helper, so the surfaces cannot drift.
  afterResponse(() =>
    notifyRoomFlare(
      resolved.room.id,
      session.id,
      session.display_name ?? "A player",
      [parsed.data.cardId],
      intent,
    ),
  );

  // The payoff for offering a card up: everyone already hunting it is
  // told. Same helper the website uses, so the two cannot drift.
  if (intent === "showcase") {
    void announceShowcase(
      { eventId: resolved.room.id, playerSessionId: session.id },
      parsed.data,
      session.display_name ?? "A player",
    );
    /* And onto the Have list, marked for nearby matching: a showcase
       is "I have this" said out loud. See nearby/showcase.ts. */
    void keepShowcaseAsHave(
      { playerSessionId: session.id, playerId: session.player_id ?? null },
      {
        cardId: parsed.data.cardId,
        printingId: parsed.data.printingId ?? null,
        quantity: parsed.data.quantity,
        note: parsed.data.note ?? null,
      },
    );
  }

  /* A card you are letting go is not a want, and saving it as one
     would follow you to the next store as a hunt for a card you were
     trying to move. */
  if (session.player_id && intent === "want") {
    await saveWant(session.player_id, parsed.data);
  }

  return Response.json({ ok: true });
}

const removeSchema = z.object({
  flareId: z.guid(),
  /*
   * "found" is the old Remove: every copy in hand, everywhere, and the
   * Feed says so. "take-down" withdraws the card and says nothing; the
   * ids come back so the app can offer an undo. "restore" is that undo.
   * Absent means "found", which is what every older build meant.
   */
  mode: z.enum(["found", "take-down", "restore"]).default("found"),
  flareIds: z.array(z.guid()).max(120).optional(),
});

/** One of a Flare's two exits, under the caller's own room identity. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normalizeJoinCode(decodeURIComponent((await params).code));
  if (!isValidJoinCode(code)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  /* Resolved for the session lookup: a signed-in player pulling a Flare
     from a room they joined elsewhere has no token of their own. */
  const resolved = await resolveCode(code);
  const session = await apiSession(
    request,
    resolved.outcome === "room" ? resolved.room.id : undefined,
  );
  if (!session) return unauthorized();

  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  if (parsed.data.mode === "take-down") {
    const result = await withdrawRoomFlare(parsed.data.flareId, session.id);
    return Response.json({ ok: result.ok, flareIds: result.flareIds });
  }

  if (parsed.data.mode === "restore") {
    const result = await restoreFlares(
      null,
      session.id,
      parsed.data.flareIds ?? [parsed.data.flareId],
    );
    return Response.json({ ok: result.ok, restored: result.restored });
  }

  await cancelFlare(parsed.data.flareId, session.id);

  return Response.json({ ok: true });
}
