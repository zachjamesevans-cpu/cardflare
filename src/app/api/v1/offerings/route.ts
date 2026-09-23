import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { markCardFound, syncCardQuantity } from "@/lib/players/found";
import { listOfferings } from "@/lib/players/wants";

export const dynamic = "force-dynamic";

/**
 * Editing an OFFERING on the Flare tab's list from the app: fewer
 * copies, or not at all. The row is the card, not one post, so both
 * verbs act on every open offering post of that card at once, the
 * same two writes the website's row makes. Ownership is the player
 * filter on the write itself.
 */
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove"), cardId: z.string().min(1) }),
  z.object({
    action: z.literal("nudge"),
    cardId: z.string().min(1),
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised offering action");
  const body = parsed.data;

  if (body.action === "remove") {
    await markCardFound(player.playerId, body.cardId, "showcase");
    return Response.json({ ok: true });
  }

  const row = (await listOfferings(player.playerId)).find(
    (entry) => entry.cardId === body.cardId,
  );
  if (!row) return badRequest("no such offering");
  const quantity = Math.min(99, Math.max(1, row.quantity + body.delta));
  await syncCardQuantity(player.playerId, body.cardId, quantity, "showcase");
  return Response.json({ ok: true, quantity });
}
