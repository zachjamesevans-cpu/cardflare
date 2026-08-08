import { z } from "zod";

import { apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/events/join-code";
import { findParticipation, setOpenToTrades } from "@/lib/events/participants";
import { resolveCode } from "@/lib/events/rooms";

export const dynamic = "force-dynamic";

const openSchema = z.object({ open: z.boolean() });

/**
 * "Open to trades" from the app — the same both-ids-checked update the
 * website's toggle makes, after the same membership re-derivation.
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

  const parsed = openSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest("open must be true or false");

  await setOpenToTrades(resolved.room.id, session.id, parsed.data.open);

  return Response.json({ ok: true });
}
