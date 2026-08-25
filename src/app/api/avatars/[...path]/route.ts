import { avatarContentType } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Profile pictures, served from cardflare's own domain.
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

  const bytes = await data.arrayBuffer();

  return new Response(bytes, {
    headers: {
      /*
       * From the extension, never echoed from the client. Everything in
       * this bucket was written by `setAvatar` — JPEG now, WebP for
       * objects uploaded before the format change — so the extension is
       * a fact this server created, not a claim anyone can smuggle in.
       */
      "content-type": avatarContentType(path.join("/")),
      "content-length": String(bytes.byteLength),
      "cache-control": CACHE,
      /*
       * The bucket now also holds cosmetic art, including HTML, and
       * HTML served from our own origin is same-origin unless
       * something says otherwise. Both renderers already put it in a
       * frame with scripting off, but somebody can also paste this URL
       * into a tab - so the response carries its own refusal to run
       * anything, and a refusal to be sniffed into a type it is not.
       */
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
