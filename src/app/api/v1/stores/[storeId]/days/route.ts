import { z } from "zod";

import { apiPlayer, apiSession, badRequest, unauthorized } from "@/lib/api/auth";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { readJsonPayload } from "@/lib/api/payload";
import { planVisit, storeDays } from "@/lib/events/store-days";

export const dynamic = "force-dynamic";

/**
 * A store's week, from the app. GET is the plan-a-visit picker: each of
 * the next seven days, whether the store is open, and the room there if
 * anybody opened one. POST {date} says Going to that day's room, opening
 * the day room if it is the first; it answers like the Going route, with
 * the room's id so the app can open it and offer the binder picker.
 */

type Params = { params: Promise<{ storeId: string }> };

const storeIdSchema = z.guid();
const planSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const STATUS = {
  "not-found": 404,
  "bad-day": 400,
  closed: 409,
  "day-over": 409,
  "no-open-trading": 409,
  "no-account": 401,
  unavailable: 503,
} as const;

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const id = storeIdSchema.safeParse((await params).storeId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const player = await apiPlayer(request);
  const days = await storeDays(id.data, player?.playerId ?? null);
  if (!days) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json({ days });
}

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const limited = tooMany(
    `going:${player.playerId}`,
    LIMITS.offer.limit,
    LIMITS.offer.windowMs,
  );
  if (limited) return limited;

  const id = storeIdSchema.safeParse((await params).storeId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = planSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("date");

  const result = await planVisit(
    id.data,
    parsed.data.date,
    player.playerId,
    player.displayName,
    await apiSession(request),
  );
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  }
  return Response.json({
    eventId: result.eventId,
    code: result.code,
    youGoing: result.youGoing,
    goingCount: result.goingCount,
    posted: result.posted,
    ...(result.freshToken ? { sessionToken: result.freshToken } : {}),
  });
}
