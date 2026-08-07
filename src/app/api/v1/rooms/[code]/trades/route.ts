import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";
import { notifyTradeConfirmed } from "@/lib/notifications/notify";
import { clearWantForFlare } from "@/lib/players/wants";
import { confirmTrade } from "@/lib/trades/repository";

export const dynamic = "force-dynamic";

const confirmSchema = z.object({
  flareId: z.guid(),
  /** Present when the trade closes an offer; absent for a walk-up trade. */
  partnerSessionId: z.guid().optional(),
});

/**
 * "We traded", from the app. `confirmTrade` re-checks ownership and the
 * partner's standing offer server-side; a confirmed trade clears the
 * requester's saved want and notifies the partner, exactly as the
 * website's action does.
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

  const participation = await findParticipation(resolved.room.id, session.id);
  if (!participation) return unauthorized();

  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("flareId is required");

  const outcome = await confirmTrade(
    parsed.data.flareId,
    resolved.room.id,
    session.id,
    parsed.data.partnerSessionId ?? null,
  );

  if (!outcome.ok) {
    return Response.json({ error: outcome.reason }, { status: 409 });
  }

  await clearWantForFlare(parsed.data.flareId);

  if (parsed.data.partnerSessionId) {
    await notifyTradeConfirmed(
      parsed.data.flareId,
      parsed.data.partnerSessionId,
      session.display_name,
    );
  }

  return Response.json({ ok: true });
}
