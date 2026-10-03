import { LIMITS, tooMany } from "@/lib/api/throttle";
import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { boardWritable, roomPhase } from "@/lib/events/schema";
import { offerTrade, withdrawOffer } from "@/lib/matching/repository";
import { offerMessageSchema, offerQuantitySchema } from "@/lib/matching/schema";
import { notifyOfferReceived } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

/**
 * Offering on a Flare from the app, and taking it back. `offerTrade`
 * re-checks everything server-side — the Flare's room, not-your-own,
 * the cap — same as it does for the website, and a successful offer
 * notifies the Flare's owner through the same backbone. Anyone may
 * pledge, held card or not, and the pledge can say how many copies.
 */

type Membership =
  | {
      ok: true;
      eventId: string;
      session: NonNullable<Awaited<ReturnType<typeof apiSession>>>;
    }
  | { ok: false; response: Response };

async function membership(request: Request, rawCode: string): Promise<Membership> {
  const code = normalizeJoinCode(decodeURIComponent(rawCode));
  if (!isValidJoinCode(code)) return { ok: false, response: unauthorized() };

  const resolved = await resolveCode(code);
  if (resolved.outcome !== "room") return { ok: false, response: unauthorized() };

  const session = await apiSession(request, resolved.room.id);
  if (!session) return { ok: false, response: unauthorized() };

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return { ok: false, response: unauthorized() };

  /* A hand goes up on a board that is taking writes: a posted night, an
     early board or a live room. A finished room keeps its history. */
  if (!boardWritable(roomPhase(resolved.room, Date.now()))) {
    return {
      ok: false,
      response: Response.json({ error: "not-open" }, { status: 409 }),
    };
  }

  return { ok: true, eventId: resolved.room.id, session };
}

const offerSchema = z.object({
  flareId: z.guid(),
  message: z.string().optional(),
  quantity: offerQuantitySchema.optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const found = await membership(request, (await params).code);
  if (!found.ok) return found.response;

  /* Per room identity: a hand raised thirty times in an hour is not a
     night at a store. */
  const limited = tooMany(
    `offer-session:${found.session.id}`,
    LIMITS.offer.limit,
    LIMITS.offer.windowMs,
  );
  if (limited) return limited;

  const parsed = offerSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  const message = offerMessageSchema.safeParse(parsed.data.message ?? "");

  const outcome = await offerTrade(
    parsed.data.flareId,
    found.eventId,
    found.session.id,
    message.success ? message.data : null,
    parsed.data.quantity ?? 1,
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
  if (!found.ok) return found.response;

  const parsed = withdrawSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("flareId is required");

  await withdrawOffer(parsed.data.flareId, found.session.id);

  return Response.json({ ok: true });
}
