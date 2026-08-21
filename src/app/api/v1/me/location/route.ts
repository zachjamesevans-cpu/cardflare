import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { postalCodeForPlayer, savePostalCode } from "@/lib/players/location";

export const dynamic = "force-dynamic";

/**
 * The ZIP a player typed, when they will not grant device location.
 *
 * The app's fallback and the only position CardFlare ever writes down.
 * A granted coordinate is NOT stored - it rides the feed request as a
 * query param and is gone (see /api/v1/feed) - so this endpoint is the
 * whole of what persists, and it is five coarse digits.
 *
 * Clearing is a PUT of an empty string rather than a DELETE, because
 * taking it back has to be the same gesture as giving it: one field,
 * emptied.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  return Response.json({ postalCode: await postalCodeForPlayer(player.playerId) });
}

export async function PUT(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const body = (await request.json().catch(() => null)) as {
    postalCode?: unknown;
  } | null;

  const result = await savePostalCode(
    player.playerId,
    typeof body?.postalCode === "string" ? body.postalCode : "",
  );

  /* The message is the one the player reads, so it comes from the same
     place the website's does rather than being written twice. */
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ postalCode: result.postalCode });
}
