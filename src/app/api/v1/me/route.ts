import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { collectionSyncFor } from "@/lib/players/collection";
import { listWants } from "@/lib/players/wants";

export const dynamic = "force-dynamic";

/**
 * The signed-in player's account snapshot: who they are, what they are
 * hunting, and whether a collection is along. The app's home screen in
 * one request — the same lib calls the website's account page makes, so
 * the two clients can never disagree about what an account contains.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const [wants, sync] = await Promise.all([
    listWants(player.playerId),
    collectionSyncFor(player.playerId),
  ]);

  return Response.json({
    player: { id: player.playerId, displayName: player.displayName },
    wants: wants.map((want) => ({
      id: want.id,
      cardId: want.cardId,
      cardName: want.cardName,
      cardNumber: want.cardNumber,
      printingId: want.printingId,
      printingLabel: want.printingLabel,
      quantity: want.quantity,
      note: want.note,
    })),
    collection: sync
      ? { cardsMatched: sync.cards_matched, syncedAt: sync.synced_at }
      : null,
  });
}
