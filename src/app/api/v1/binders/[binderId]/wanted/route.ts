import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { readBinder } from "@/lib/binder/binder";
import { wantedCountsForHolder, wantedInBinder } from "@/lib/nearby/matching";
import { binderIdSchema } from "../../_shared";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ binderId: string }> };

/**
 * Which of this binder's cards somebody nearby wants, and how many
 * people: `{ wanted: { [cardId]: people } }`. The owner's own binder up
 * for trade only; anyone else, or a private binder, gets an empty map,
 * so the line simply does not show. Read separately from the binder so
 * opening one never waits on the distance matching.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();
  const id = binderIdSchema.safeParse((await params).binderId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });
  const [binder, counts] = await Promise.all([
    readBinder(player.playerId, player.playerId, id.data),
    wantedCountsForHolder(player.playerId),
  ]);
  if (!binder?.yours || !binder.forTrade) return Response.json({ wanted: {} });
  return Response.json({
    wanted: wantedInBinder(
      counts,
      binder.cards.map((card) => card.cardId),
    ),
  });
}
