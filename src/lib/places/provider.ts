import "server-only";

/**
 * Where candidate stores come from, as an interface rather than a
 * dependency.
 *
 * Overture Maps Places is the approved source and it has ONE property
 * that shapes everything here: there is no hosted query API. Places is
 * GeoParquet on S3 and Azure, queried with DuckDB, the Python client or
 * the web Explorer. So a "Find stores" button cannot call an endpoint,
 * and discovery runs as an admin script rather than inside a request.
 *
 * That is exactly why this is an interface. The console talks to a
 * provider; a fixture provider answers during development, and the
 * Overture one lands behind the same shape without the review, scoring,
 * duplicate-detection and import flow knowing anything changed.
 *
 * The founder's rule, which this file exists to keep: no scraping, no
 * crawlers, no substituting another provider without approval.
 */

/** One place as a provider describes it, before CardFlare judges it. */
export interface PlaceCandidate {
  /**
   * The provider's own id. Overture's GERS id is stable across releases,
   * which is what lets a rejection be remembered rather than re-shown.
   */
  providerPlaceId: string;
  name: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  /**
   * The provider's categories, lower-cased.
   *
   * Overture calls this `taxonomy` with a `basic_category` now; the old
   * `categories` field is deprecated. Flattened to strings here because
   * the relevance rules only ever ask "does any of this look like a game
   * shop", and a shape that mirrors one provider's taxonomy would have to
   * change the day a second provider arrives.
   */
  categories: string[];
  /**
   * The provider's own confidence that the place exists, 0 to 1.
   *
   * A statement about the RECORD, not about the shop's front door, and
   * never to be printed as "likely operating".
   */
  confidence: number | null;
  /**
   * The provider's own operating status, quoted rather than interpreted.
   *
   * Overture's published field list omits this; the release schema has
   * it. Repeated verbatim and attributed to the provider - CardFlare
   * does not decide whether a shop is open.
   */
  operatingStatus: string | null;
  /** Which licence this individual record carries. Places is a mix. */
  license: string | null;
  /** The line that has to travel with the record if it is shown. */
  attribution: string | null;
}

export interface PlacesSearch {
  /** A free-text area, as the admin typed it. */
  area: string;
  /** Miles. The console offers a small set; the provider may clamp. */
  radiusMiles: number;
}

export interface PlacesProvider {
  /** Named in the console and written to `store_sources.provider`. */
  readonly name: string;
  search(query: PlacesSearch): Promise<PlaceCandidate[]>;
}
