import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import {
  BINDER_OFFER_MAX_CARDS,
  BINDER_OFFER_NOTE_MAX,
  binderOfferSentLine,
} from "@/lib/binder/offer-copy";
import { offerOnBinder } from "@/lib/binder/offers";
import { binderIdSchema } from "../../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

const offerSchema = z.object({
  items: z
    .array(z.object({ entryId: z.guid(), quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(BINDER_OFFER_MAX_CARDS),
  note: z.string().max(BINDER_OFFER_NOTE_MAX).nullable().optional(),
});

/**
 * "Send offer" in somebody's trade binder, from the app: the picked
 * cards as one message in the pair's conversation. Answers the
 * conversation's id, so the app can open it.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `message:${player.playerId}`,
    LIMITS.message.limit,
    LIMITS.message.windowMs,
  );
  if (limited) return limited;

  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const parsed = offerSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("items: [{ entryId, quantity }], note");

  const sent = await offerOnBinder(
    id.data,
    player.playerId,
    parsed.data.items,
    parsed.data.note ?? null,
  );
  if (!sent.ok) {
    const status =
      sent.reason === "not-found" ? 404 : sent.reason === "unavailable" ? 503 : 409;
    return Response.json({ ok: false, reason: sent.reason }, { status });
  }
  return Response.json({
    ok: true,
    threadId: sent.threadId,
    message: binderOfferSentLine(sent.ownerName),
  });
}
