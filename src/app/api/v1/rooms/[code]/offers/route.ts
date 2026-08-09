import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { offerTrade, withdrawOffer } from "@/lib/matching/repository";
import { offerMessageSchema } from "@/lib/matching/schema";
import { notifyOfferReceived } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

/**
 * Offering on a Flare from the app, and taking it back. `offerTrade`
 * re-checks everything server-side — the Flare's room, not-your-own,
 * binder-or-collection possession, the cap — same as it does for the
 * website, and a successful offer notifies the Flare's owner through
 * the same backbone.
 */

async function membership(request: Request, rawCode: string) {
  const code = normalizeJoinCode(decodeURIComponent(rawCode));
  if (!isValidJoinCode(code)) return null;

  const session = await apiSession(request);
  if (!session) return null;

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") return null;

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return null;

  return { eventId: resolved.room.id, session };
}

const offerSchema = z.object({
  flareId: z.guid(),
  message: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const found = await membership(request, (await params).code);
  if (!found) return unauthorized();

  const parsed = offerSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  const message = offerMessageSchema.safeParse(parsed.data.message ?? "");

  const outcome = await offerTrade(
    parsed.data.flareId,
    found.eventId,
    found.session.id,
    message.success ? message.data : null,
  );

  if (!outcome.ok) {
    return Response.json({ error: outcome.reason }, { status: 409 });
  }

  await notifyOfferReceived(
    parsed.data.flareId,
    found.session.id,
    found.session.display_name,
    message.success ? message.data : null,
  );

  return Response.json({ ok: true });
}

const withdrawSchema = z.object({ flareId: z.guid() });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const found = await membership(request, (await params).code);
  if (!found) return unauthorized();

  const parsed = withdrawSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  await withdrawOffer(parsed.data.flareId, found.session.id);

  return Response.json({ ok: true });
}
