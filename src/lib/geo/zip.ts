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

/**
 * Every ZIP whose centroid is within `miles` of a point.
 *
 * For finding area Flares, which are anchored to their poster's ZIP and
 * so cannot be filtered by a coordinate index. Turning the radius into a
 * list of postal codes moves the work to a column Postgres CAN index, and
 * keeps the alternative — reading every open area Flare in the country and
 * measuring it here — off the table.
 *
 * A bounding box first, because haversine on thirty-three thousand
 * centroids for every read of the tab is silly when a degree comparison
 * discards almost all of them.
 */
export function zipsWithin(origin: Point, miles: number): string[] {
  const latSpan = miles / 69;
  const shrink = Math.max(Math.cos((origin.latitude * Math.PI) / 180), 0.01);
  const lonSpan = miles / (69 * shrink);

  const out: string[] = [];

  for (const [zip, pair] of Object.entries(CENTROIDS)) {
    if (pair?.length !== 2) continue;

    const [latitude, longitude] = pair as [number, number];
    if (Math.abs(latitude - origin.latitude) > latSpan) continue;
    if (Math.abs(longitude - origin.longitude) > lonSpan) continue;
    if (milesApart(origin, { latitude, longitude }) > miles) continue;

    out.push(zip);
  }

  return out;
}

const EARTH_MILES = 3958.8;

/** Haversine, kept here so this module owes nothing to the store code. */
function milesApart(a: Point, b: Point): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}
