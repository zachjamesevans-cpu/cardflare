import { apiPlayer } from "@/lib/api/auth";
import { hasLocal } from "@/lib/players/locals";
import { publicStore } from "@/lib/stores/public-profile";

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
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store) return Response.json({ error: "not-found" }, { status: 404 });

  const account = await apiPlayer(request);
  const following = account ? await hasLocal(account.playerId, store.storeId) : false;

  return Response.json({ store: { ...store, following } });
}
