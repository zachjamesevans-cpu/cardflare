import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalisePostalCode, pointForPostalCode, type Point } from "@/lib/geo/zip";

/**
 * Where a player is, and how cardflare came to know.
 *
 * The founder's correction, on a first cut that anchored "nearby" on a
 * store the player had saved: "really it should be asking for location
 * permissions to find stores near them, or at the very least asking for
 * a zip code of their address. nothing to do with 'my store', because
 * most of this is customer/player facing."
 *
 * That is right, and the saved-store anchor is gone. A shop somebody
 * ticked months ago is not where they are standing, most players have
 * ticked none, and asking a player where they are is the honest version
 * of a question we were answering behind their back.
 *
 * TWO SOURCES, IN ORDER:
 *
 *   1. `device` — coordinates a phone sent with the request, after the
 *      player granted permission. Best answer, and NEVER WRITTEN DOWN:
 *      it lives for the length of one request. Nothing in the schema can
 *      hold it, which is the strongest promise available.
 *
 *   2. `postal` — the five digits on their profile, resolved to a ZCTA
 *      centroid. Coarse by construction and stored, because it has to
 *      survive between visits to be worth typing.
 *
 * And a third state that is not a source: `none`, which the caller shows
 * as an ASK rather than an empty space. A player who has given us
 * nothing should see a prompt, not a Local tab that appears broken.
 */
export type OriginSource = "device" | "postal" | "none";

export interface PlayerOrigin {
  point: Point | null;
  source: OriginSource;
}

export const NO_ORIGIN: PlayerOrigin = { point: null, source: "none" };

/**
 * The player's position for this request.
 *
 * `device` wins without a database round trip, which is also the common
 * case on a phone that granted permission — so the ZIP is only ever read
 * for the players who need it.
 */
export async function originForPlayer(
  playerId: string,
  device: Point | null,
): Promise<PlayerOrigin> {
  if (device) return { point: device, source: "device" };

  const postal = await postalCodeForPlayer(playerId);
  const point = pointForPostalCode(postal);

  /* A ZIP that resolves to nothing is the same as no ZIP: five digits
     that are not a real ZCTA (a PO-box-only prefix, a typo) must not
     anchor somebody's feed anywhere. */
  return point ? { point, source: "postal" } : NO_ORIGIN;
}

export async function postalCodeForPlayer(playerId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("postal_code")
    .eq("id", playerId)
    .maybeSingle();

  return data?.postal_code ?? null;
}

/**
 * Set or clear the player's ZIP.
 *
 * Clearing is a first-class outcome rather than an error: an empty field
 * is how somebody takes it back, and taking it back has to be as easy as
 * giving it. Anything that is neither blank nor five digits is refused,
 * so the column's constraint is never the thing that reports a typo.
 */
export async function savePostalCode(
  playerId: string,
  raw: string,
): Promise<{ ok: boolean; postalCode: string | null; error?: string }> {
  const blank = raw.trim() === "";
  const postalCode = blank ? null : normalisePostalCode(raw);

  if (!blank && !postalCode) {
    return { ok: false, postalCode: null, error: "Enter a five-digit ZIP code." };
  }

  /* Checked before writing rather than after, because a ZIP that
     resolves to nothing would save cleanly and then silently fail to
     produce a single nearby store - which reads as a broken feature
     rather than a bad ZIP. */
  if (postalCode && !pointForPostalCode(postalCode)) {
    return {
      ok: false,
      postalCode: null,
      error: "We don't know that ZIP code. Check the digits?",
    };
  }

  const { error } = await getSupabaseAdmin()
    .from("players")
    .update({ postal_code: postalCode })
    .eq("id", playerId);

  if (error) {
    return { ok: false, postalCode: null, error: "Could not save that. Try again?" };
  }

  return { ok: true, postalCode };
}
