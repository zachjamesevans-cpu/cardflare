import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { roomPhase } from "@/lib/events/schema";
import { notifyEarlyBoardFlares, notifyRoomFlare } from "@/lib/notifications/notify";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { addFlare, cancelFlare } from "@/lib/lists/repository";
import { announceShowcase } from "@/lib/lists/showcase";
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

  const session = await apiSession(request);
  if (!session) return unauthorized();

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") {
    return Response.json({ error: "not-open" }, { status: 409 });
  }

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
  }

  /* A card you are letting go is not a want, and saving it as one
     would follow you to the next store as a hunt for a card you were
     trying to move. */
  if (session.player_id && intent === "want") {
    await saveWant(session.player_id, parsed.data);
  }

  return Response.json({ ok: true });
}

const removeSchema = z.object({ flareId: z.guid() });

/** Taking a Flare down — `cancelFlare` only ever touches the caller's own. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normalizeJoinCode(decodeURIComponent((await params).code));
  if (!isValidJoinCode(code)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  const session = await apiSession(request);
  if (!session) return unauthorized();

  const parsed = removeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  await cancelFlare(parsed.data.flareId, session.id);

  return Response.json({ ok: true });
}
