import "server-only";

import type { PlaceCandidate, PlacesProvider, PlacesSearch } from "./provider";

/**
 * Made-up places, for building the review flow without touching a real
 * provider.
 *
 * The founder's instruction: "use development fixtures for store
 * discovery until the feature is working", and "do NOT search Austin or
 * import any real stores yet". So this is the only provider wired up in
 * Phase 1, and it is obvious about being invented - every name here is
 * fictional and every id is prefixed `fixture:` so a row that somehow
 * reached the database would announce where it came from.
 *
 * It is also the test set for the relevance rules: a clear game shop, a
 * hybrid comic-and-tabletop store, a mass retailer that must be refused,
 * a video game store that must not be confused for an LGS, and a place
 * with almost no metadata.
 */
const CANDIDATES: PlaceCandidate[] = [
  {
    providerPlaceId: "fixture:dragons-hoard",
    name: "Dragon's Hoard Games",
    addressLine: "2438 W Anderson Ln",
    city: "Austin",
    region: "TX",
    postalCode: "78757",
    country: "US",
    latitude: 30.3565,
    longitude: -97.7411,
    website: "https://example.invalid/dragons-hoard",
    phone: "+1 512 555 0147",
    categories: ["hobby_shop", "trading_card_store"],
    confidence: 0.94,
    license: "CDLA-Permissive-2.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
  {
    providerPlaceId: "fixture:north-loop-comics",
    name: "North Loop Comics & Tabletop",
    addressLine: "110 E North Loop Blvd",
    city: "Austin",
    region: "TX",
    postalCode: "78751",
    country: "US",
    latitude: 30.3187,
    longitude: -97.7226,
    website: "https://example.invalid/north-loop",
    phone: null,
    categories: ["comic_book_store", "board_game_store"],
    confidence: 0.81,
    license: "CDLA-Permissive-2.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
  {
    providerPlaceId: "fixture:cedar-park-cards",
    name: "Cedar Park Card Exchange",
    addressLine: "1335 E Whitestone Blvd",
    city: "Cedar Park",
    region: "TX",
    postalCode: "78613",
    country: "US",
    latitude: 30.5217,
    longitude: -97.8203,
    website: null,
    phone: "+1 512 555 0182",
    categories: ["collectibles_store"],
    confidence: 0.62,
    license: "Apache-2.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
  {
    providerPlaceId: "fixture:pixel-palace",
    name: "Pixel Palace",
    addressLine: "900 E 41st St",
    city: "Austin",
    region: "TX",
    postalCode: "78751",
    country: "US",
    latitude: 30.3038,
    longitude: -97.7215,
    website: null,
    phone: null,
    categories: ["video_game_store", "arcade"],
    confidence: 0.7,
    license: "CDLA-Permissive-2.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
  {
    providerPlaceId: "fixture:walmart-supercenter",
    name: "Walmart Supercenter",
    addressLine: "710 E Ben White Blvd",
    city: "Austin",
    region: "TX",
    postalCode: "78704",
    country: "US",
    latitude: 30.2246,
    longitude: -97.7583,
    website: "https://example.invalid/walmart",
    phone: null,
    categories: ["department_store", "toy_store"],
    confidence: 0.99,
    license: "CDLA-Permissive-2.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
  {
    providerPlaceId: "fixture:unmarked-storefront",
    name: "Riverside Collectibles",
    addressLine: null,
    city: "Austin",
    region: "TX",
    postalCode: null,
    country: "US",
    latitude: 30.2361,
    longitude: -97.7099,
    website: null,
    phone: null,
    categories: [],
    confidence: 0.31,
    license: "CC0-1.0",
    attribution: "Overture Maps Foundation, overturemaps.org",
  },
];

/** The provider used until a real search is approved. */
export class FixturePlacesProvider implements PlacesProvider {
  readonly name = "fixtures";

  /* The area and radius are ignored on purpose: these six are the review
     flow's test set, not a map. A provider that filtered them would make
     the console harder to exercise, not more honest. */
  async search(query: PlacesSearch): Promise<PlaceCandidate[]> {
    void query;
    return CANDIDATES;
  }
}
