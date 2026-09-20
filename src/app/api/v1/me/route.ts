import { apiPlayer, apiStaffStores, unauthorized } from "@/lib/api/auth";
import { feedViewFor } from "@/lib/feed/view-settings";
import { collectionSyncFor } from "@/lib/players/collection";
import { listLocals } from "@/lib/players/locals";
import { listWants, postedCardStores } from "@/lib/players/wants";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { postedLabel } from "@/lib/players/wants";

export const dynamic = "force-dynamic";

/** The stores an account runs, named, for the remote's picker. */
async function staffedStores(
  userId: string,
): Promise<{ storeId: string; name: string; code: string; role: "owner" | "staff" }[]> {
  const memberships = await apiStaffStores(userId);
  if (memberships.length === 0) return [];
  const { data } = await getSupabaseAdmin()
    .from("stores")
    .select("id, name, join_code")
    .in(
      "id",
      memberships.map((m) => m.storeId),
    );
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return memberships.flatMap((m) => {
    const store = byId.get(m.storeId);
    return store
      ? [{ storeId: m.storeId, name: store.name, code: store.join_code, role: m.role }]
      : [];
  });
}

/**
 * The signed-in player's account snapshot: who they are, what they are
 * hunting, and whether a collection is along. The app's home screen in
 * one request — the same lib calls the website's account page makes, so
 * the two clients can never disagree about what an account contains.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const [wants, sync, locals, account, posted] = await Promise.all([
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
    /* Which of those cards are live on a board right now - the second of
       the list's two states. See postedCardStores. */
    postedCardStores(player.playerId),
  ]);

  return Response.json({
    player: {
      id: player.playerId,
      displayName: player.displayName,
      handle: player.handle,
      avatarUrl: account.data?.avatar_url ?? null,
      embersBalance: account.data?.embers_balance ?? 0,
      /*
       * How they want the Feed drawn. Here as well as on the profile
       * because the Feed asks this endpoint and nothing else.
       *
       * READ ON ITS OWN, deliberately. Folded into the select above it
       * would take the whole of /me down on any deploy that landed
       * before the migration - and /me is the endpoint the app opens
       * with. `feedViewFor` logs and falls back to the original card,
       * so a missing column costs a setting rather than a session.
       */
      feedView: await feedViewFor(player.playerId),
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
      /*
       * Where it is live. Both shapes on purpose: `postedAt` is the old
       * one-line label, kept because the app ships on TestFlight's clock
       * and a build that predates the tappable version must not lose the
       * line entirely; `postedBoards` carries the room codes so a newer
       * build can walk in.
       */
      postedAt: postedLabel(posted.get(want.cardId) ?? []),
      postedBoards: posted.get(want.cardId) ?? [],
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
    /* The stores this account may RUN, for the remote: owners and
       organizers alike. Empty for nearly everybody. */
    staff: await staffedStores(player.userId),
  });
}
