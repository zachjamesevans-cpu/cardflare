import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { cardArtContentType } from "@/lib/cards/art-storage";

export const dynamic = "force-dynamic";

/**
 * Card art CardFlare hosts itself, served from CardFlare's own domain.
 *
 * The same shape as `/api/avatars`, for the same field reason: something
 * between a phone on real wifi and a third-party host eats the request,
 * and the fix is to stop making the request. Provider artwork still
 * comes straight from the provider, because that costs nothing and works
 * — this route exists only for sets no provider has yet, where the file
 * is ours and there is nowhere else to point.
 *
 * The cache header is the whole economics of the feature. Object paths
 * carry the card number and are never rewritten, so the answer is
 * immutable and can be cached for a year: the CDN in front pays one
 * origin fetch per image per region, and a returning player pays none at
 * all. Storage egress does not scale with lookups, only with cache
 * misses.
 *
 * Deliberately unauthenticated. A card image is shown on a public board
 * to guests with no account by design, and a session check here would
 * break the front door.
 */

/** A year. The path changes whenever the art does. */
const CACHE = "public, max-age=31536000, immutable";

/** Deep enough for provider/set/file, and no deeper. */
const MAX_SEGMENTS = 4;

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
   * this from being a way to read other objects in the bucket — the same
   * guard the avatar route carries, and the third independent check on
   * traversal after the database constraint and the render-time gate.
   */
  if (
    path.length === 0 ||
    path.length > MAX_SEGMENTS ||
    path.some(
      (segment) => !/^[A-Za-z0-9._-]+$/.test(segment) || segment.startsWith("."),
    )
  ) {
    return new Response("Not found", { status: 404 });
  }

  const object = path.join("/");

  const { data, error } = await getSupabaseAdmin()
    .storage.from("card-art")
    .download(object);

  if (error || !data) {
    /*
     * Not logged as an error. A missing image is ordinary while a set is
     * being imported, and the renderer already falls back to the
     * placeholder without anybody noticing.
     */
    return new Response("Not found", { status: 404 });
  }

  return new Response(data, {
    headers: {
      "Content-Type": cardArtContentType(object),
      "Cache-Control": CACHE,
      "Content-Length": String(data.size),
    },
  });
}
