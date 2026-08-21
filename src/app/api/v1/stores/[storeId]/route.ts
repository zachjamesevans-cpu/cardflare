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
 * No auth. An unclaimed listing exists so players can find a shop that
 * has never heard of CardFlare, and a page behind a sign-in would defeat
 * the point. A draft still 404s.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ storeId: string }> },
): Promise<Response> {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store) return Response.json({ error: "not-found" }, { status: 404 });

  return Response.json({ store });
}
