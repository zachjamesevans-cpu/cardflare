import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { setPacked } from "@/lib/events/night-matches";

export const dynamic = "force-dynamic";

/**
 * Packed, from the app: PUT `{ cardId, packed }` ticks or unticks one
 * card on the viewer's What to bring list at a night. The same
 * `setPacked` the website's action calls, keyed on the account behind
 * the bearer token, so a tick on the phone is the tick on the laptop.
 */

type Params = { params: Promise<{ eventId: string }> };

const eventIdSchema = z.guid();

const packedSchema = z.object({
  cardId: z.guid(),
  packed: z.boolean(),
});

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const account = await apiPlayer(request);
  if (!account) return unauthorized();

  const id = eventIdSchema.safeParse((await params).eventId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const parsed = packedSchema.safeParse((await readJsonPayload(request)) ?? {});
  if (!parsed.success) return badRequest("cardId and packed are required");

  const ok = await setPacked(
    id.data,
    account.playerId,
    parsed.data.cardId,
    parsed.data.packed,
  );
  if (!ok) return Response.json({ error: "unavailable" }, { status: 503 });

  return Response.json({ ok: true });
}
