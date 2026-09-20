import { apiPlayer } from "@/lib/api/auth";
import { hasLocal } from "@/lib/players/locals";
import { siteUrl } from "@/lib/site";
import { openNow } from "@/lib/stores/hours";
import { publicStore } from "@/lib/stores/public-profile";
import { storeBoard } from "@/lib/players/locals";

export const dynamic = "force-dynamic";

/**
 * One store, as a player sees it.
 *
 * Same `publicStore` the website's /s/[storeId] calls, so the two
 * clients can never disagree about what a listing says — including the
 * privacy boundary, which is the shape of the returned object: no
 * coordinates, no contact email, no provenance beyond the attribution
 * line the licence requires.
 *
 * No auth REQUIRED. An unclaimed listing exists so players can find a
 * shop that has never heard of cardflare, and a page behind a sign-in
 * would defeat the point. A draft still 404s. A bearer token, when one
 * is sent, adds `following` so the app's Follow button can draw its
 * first word without a second call.
 *
 * The pictures go out ABSOLUTE. A relative `/api/avatars/...` means
 * nothing to a phone with no origin to resolve it against - the Feed
 * learned that one face at a time. And `openNow` is decided here, in
 * the store's zone, so the phone never has to know what a time zone
 * is to print the word.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store) return Response.json({ error: "not-found" }, { status: 404 });

  const account = await apiPlayer(request);
  const [following, board] = await Promise.all([
    account ? hasLocal(account.playerId, store.storeId) : Promise.resolve(false),
    storeBoard(store.storeId),
  ]);

  const origin = siteUrl();
  const absolute = (path: string | null) =>
    path && path.startsWith("/") ? `${origin}${path}` : path;

  return Response.json({
    store: {
      ...store,
      logoUrl: absolute(store.logoUrl),
      coverUrl: absolute(store.coverUrl),
      openNow: store.hours ? openNow(store.hours, new Date(), store.timeZone) : null,
      following,
      /* The same line the website draws under the header: a room open
         right now, or the next night on the calendar. */
      board: board
        ? {
            liveNow: board.liveNow,
            joinCode: board.joinCode,
            nextEventAt: board.nextEventAt,
            nextEventName: board.nextEventName,
            timeZone: board.timeZone,
          }
        : null,
    },
  });
}
