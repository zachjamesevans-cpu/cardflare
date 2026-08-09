import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { addFlare, cancelFlare } from "@/lib/lists/repository";
import { addEntrySchema } from "@/lib/lists/schema";
import { saveWant } from "@/lib/players/wants";

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
  if (resolved.outcome !== "room" || resolved.room.status !== "open") {
    return Response.json({ error: "not-open" }, { status: 409 });
  }

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return unauthorized();

  const parsed = addEntrySchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("cardId and quantity are required");

  const result = await addFlare(resolved.room.id, session.id, parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 409 });
  }

  if (session.player_id) {
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
