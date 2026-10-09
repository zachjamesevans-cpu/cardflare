import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { nightBinderState, saveNightBinders } from "@/lib/events/night-binders";

export const dynamic = "force-dynamic";

/**
 * Binders I'm Bringing, from the app. GET is the picker: every binder
 * the player owns, which are picked for this night, and whether the
 * night still takes changes. PUT replaces the picks; an empty list is
 * "not bringing any". The rules are night-binders.ts's, the same the
 * website's action applies.
 */

type Params = { params: Promise<{ eventId: string }> };

const eventIdSchema = z.guid();

const picksSchema = z.object({
  picks: z.array(z.object({ binderId: z.guid(), eventOnly: z.boolean() })).max(40),
});

const STATUS = {
  "not-yours": 404,
  "needs-consent": 400,
  "not-going": 409,
  "not-open": 409,
  unavailable: 503,
} as const;

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = eventIdSchema.safeParse((await params).eventId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const state = await nightBinderState(id.data, player.playerId);
  if (!state) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json({ state });
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = eventIdSchema.safeParse((await params).eventId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const parsed = picksSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("picks");

  const result = await saveNightBinders(id.data, player.playerId, parsed.data.picks);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  }
  return Response.json({ state: result.state });
}
