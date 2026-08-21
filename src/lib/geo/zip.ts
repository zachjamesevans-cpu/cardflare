import centroids from "@/../data/geo/zcta-centroids.json";

/**
 * Where a ZIP code is, roughly.
 *
 * The fallback when a player will not or cannot give a device location,
 * and the primary answer on the website, where the browser's permission
 * prompt is worse than a typed field and far less likely to be granted.
 *
 * COARSE ON PURPOSE. A ZCTA centroid is the middle of an area that can be
 * miles across - exactly the resolution "stores near you" needs, and
 * nothing like a home address. Nothing finer is ever asked for, and what
 * reaches a client is a distance rather than a point.
 *
 * Bundled rather than fetched. A geocoding API would see a user's
 * location on every lookup, cost per request, and be a third party the
 * founder had not approved. See data/geo/README.md for the source.
 *
 * Imported statically for the same reason snapshots are - Next.js traces
 * a serverless function's files by reading the source, so a runtime
 * `readFile` of this table would be absent in production and every
 * lookup would quietly return null.
 */
/* Through `unknown` because TypeScript infers `number[]` from a JSON
   array and will not narrow it to a pair on its own. The pair is
   re-checked at the point of use rather than asserted here. */
const CENTROIDS = centroids as unknown as Record<string, number[]>;

export interface Point {
  latitude: number;
  longitude: number;
}

/** The five digits, or null. Accepts "97477-1234" and "  97477 ". */
export function normalisePostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.trim().slice(0, 5);
  return /^\d{5}$/.test(digits) ? digits : null;
}

/** The centroid of a ZIP, or null if it is not a real one. */
export function pointForPostalCode(raw: string | null | undefined): Point | null {
  const zip = normalisePostalCode(raw);
  if (!zip) return null;

  const found = CENTROIDS[zip];
  if (found?.length !== 2) return null;

  return { latitude: found[0], longitude: found[1] };
}

/**
 * A coordinate a client sent, if it is one.
 *
 * Device coordinates arrive as query strings from a phone, so they are
 * parsed defensively: NaN, out-of-range, and the null island (0,0) that
 * a broken location stack loves to report are all rejected rather than
 * anchoring somebody's feed in the Gulf of Guinea.
 */
export function pointFromCoords(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
): Point | null {
  const lat = typeof latitude === "string" ? Number(latitude) : latitude;
  const lon = typeof longitude === "string" ? Number(longitude) : longitude;

  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null;

  return { latitude: lat, longitude: lon };
}
