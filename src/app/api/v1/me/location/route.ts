import { apiPlayer, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { pointFromCoords } from "@/lib/geo/zip";
import {
  postalCodeForPlayer,
  savePostalCode,
  savePostalCodeFromPoint,
} from "@/lib/players/location";

export const dynamic = "force-dynamic";

/**
 * The player's ZIP: typed, or snapped from "Use my location".
 *
 * The only position cardflare ever writes down. A granted coordinate
 * is NOT stored - the Feed's rides its request and is gone (see
 * /api/v1/feed), and one sent here is turned into the nearest ZIP and
 * dropped - so this endpoint is the whole of what persists, and it is
 * five coarse digits.
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

  /*
   * `readJsonPayload`, NEVER `request.json()`. The app sends every write
   * in the `x-cf-payload` header and no body at all - a field-found
   * workaround for a network that kills bodied requests in transit. A
   * route that reads the body directly gets `null` from the app and
   * carries on as if the player had sent nothing, which here would have
   * meant an empty string: silently CLEARING the ZIP they just typed
   * instead of saving it, with a cheerful success message.
   */
  const body = (await readJsonPayload(request)) as {
    postalCode?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  } | null;

  /*
   * Either a typed ZIP, or the phone's position from "Use my location",
   * which is snapped to a ZIP and dropped (savePostalCodeFromPoint).
   * Nothing usable is a 400, not a clear: clearing is an explicit empty
   * string, never what a lost payload happens to look like.
   */
  const point =
    typeof body?.latitude === "number" && typeof body?.longitude === "number"
      ? pointFromCoords(body.latitude, body.longitude)
      : null;
  if (typeof body?.postalCode !== "string" && !point) {
    return Response.json({ error: "Send a ZIP code or a location." }, { status: 400 });
  }

  const result =
    typeof body?.postalCode === "string"
      ? await savePostalCode(player.playerId, body.postalCode)
      : await savePostalCodeFromPoint(player.playerId, point!);

  /* The message is the one the player reads, so it comes from the same
     place the website's does rather than being written twice. */
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ postalCode: result.postalCode });
}
