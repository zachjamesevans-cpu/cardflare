import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { collectionSyncFor } from "@/lib/players/collection";
import { listLocals } from "@/lib/players/locals";
import { listWants } from "@/lib/players/wants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

  const [wants, sync, locals, account] = await Promise.all([
    listWants(player.playerId),
    collectionSyncFor(player.playerId),
    listLocals(player.playerId),
    /*
     * The picture and the balance, for the app's home header.
     *
     * Two columns off one indexed row rather than the whole profile: the
     * home screen is the most-opened screen in the product and it needs a
     * face and a number, not a wardrobe. The dressed avatar - rings,
     * auras, worn files - stays on the Profile tab, which is the screen
     * that already pays for it.
     */
    getSupabaseAdmin()
      .from("players")
      .select("avatar_url, embers_balance")
      .eq("id", player.playerId)
      .maybeSingle(),
  ]);

  return Response.json({
    player: {
      id: player.playerId,
      displayName: player.displayName,
      handle: player.handle,
      avatarUrl: account.data?.avatar_url ?? null,
      embersBalance: account.data?.embers_balance ?? 0,
    },
    wants: wants.map((want) => ({
      id: want.id,
      cardId: want.cardId,
      cardName: want.cardName,
      cardNumber: want.cardNumber,
      printingId: want.printingId,
      printingLabel: want.printingLabel,
      quantity: want.quantity,
      note: want.note,
      deckLabel: want.deckLabel,
      imageUrl: want.imageUrl,
    })),
    collection: sync
      ? { cardsMatched: sync.cards_matched, syncedAt: sync.synced_at }
      : null,
    locals: locals.map((local) => ({
      storeId: local.storeId,
      name: local.name,
      city: local.city,
      region: local.region,
      code: local.joinCode,
      liveNow: local.liveNow,
      nextEventAt: local.nextEventAt,
      nextEventName: local.nextEventName,
      nextEventCode: local.nextEventCode,
      earlyOpen: local.earlyOpen,
    })),
  });
}
