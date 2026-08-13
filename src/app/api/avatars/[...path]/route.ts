import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Profile pictures, served from CardFlare's own domain.
 *
 * The browser never talks to the storage host. That is the whole point:
 * pointing an `<img>` at the Supabase public URL worked from the server
 * and failed on the founder's phone, which is the same failure mode that
 * already forced this app's writes into a header. Something between a
 * phone on real wifi and a third-party host eats the request, and the
 * fix is to stop making the request.
 *
 * Two things follow from serving it here. The bucket no longer has to be
 * public for a picture to appear, so nobody has to know or check whether
 * it is. And the cache headers are ours: object paths carry the upload's
 * timestamp and are never rewritten, so the answer is immutable and can
 * be cached for a year. One hop per new picture, not per page view.
 *
 * Deliberately unauthenticated. An avatar is shown to a room full of
 * strangers by design, and putting a session check here would mean a
 * guest at a counter could not see who they are trading with.
 */

/** A year. The path changes whenever the picture does. */
const CACHE = "public, max-age=31536000, immutable";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!isSupabaseConfigured()) return new Response("Not found", { status: 404 });

  const { path } = await params;

  /*
   * The segments come from the URL, so they are attacker-controlled.
   * Next has already decoded them, which means "..%2F.." arrives here as
   * "../". Rejecting any segment that is not a plain name is what keeps
   * this from being a way to read other objects in the bucket.
   */
  if (
    path.length === 0 ||
    path.length > 4 ||
    path.some(
      (segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment.startsWith("."),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const { data, error } = await getSupabaseAdmin()
    .storage.from("avatars")
    .download(path.join("/"));

  if (error || !data) {
    /*
     * Not logged as an error. A missing avatar is ordinary: a picture
     * removed while a stale page still references it, or a bookmarked
     * URL from before a change. It is a 404, not an incident.
     */
    return new Response("Not found", { status: 404 });
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      /*
       * Fixed, never echoed from the object. Everything in this bucket
       * was written by `setAvatar`, which re-encodes to WebP — so this
       * is a statement of fact, and it cannot be turned into a way to
       * serve something else's content type.
       */
      "content-type": "image/webp",
      "cache-control": CACHE,
    },
  });
}
