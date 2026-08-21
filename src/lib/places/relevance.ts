/**
 * Is this candidate a local game store?
 *
 * DETERMINISTIC, and that is the requirement rather than a preference:
 * "do not rely on an LLM as the sole classifier." Categories, name and a
 * mass-retailer exclusion list, in that order, with the reasons kept
 * beside the verdict so an admin can see WHY something scored as it did
 * instead of being asked to trust a number.
 *
 * The verdict is a recommendation. Import is a separate, explicit act by
 * a human, and nothing here publishes anything.
 *
 * No `server-only` import: this is arithmetic over strings, and the unit
 * tests read it directly.
 */

export type LgsVerdict = "likely" | "possible" | "unlikely";

export interface Relevance {
  verdict: LgsVerdict;
  /** Shown next to the verdict, in the console, in this order. */
  reasons: string[];
}

/**
 * Categories that mean a game shop nearly every time.
 *
 * MATCHED EXACTLY, not as substrings, and that is a correction made
 * against real data. The first cut matched substrings so a taxonomy
 * rename would not break it - and on the real Austin extract that pulled
 * in `cardiology` for "card" and `garbage_collection_service` for
 * "collect". A provider's category is a controlled value; treating it as
 * prose finds nonsense.
 *
 * These are Overture `taxonomy.primary` values, which is where the real
 * signal lives. `basic_category` is a ~280-value coarse label and is far
 * too blunt: Austin's best-known game store is not under it at all, and
 * `toys_and_games_store` there is mostly actual toy shops.
 */
const STRONG_CATEGORIES = [
  "hobby_shop",
  "comic_books_store",
  "comic_book_store",
  "game_store",
  "board_game_store",
  "trading_card_store",
  "collectibles_store",
  "tabletop_game_store",
];

/** Words in a shop's own name that say what it is. */
const STRONG_NAME_WORDS = [
  "card",
  "cards",
  "tcg",
  "game",
  "games",
  "gaming",
  "hobby",
  "comic",
  "comics",
  "collectible",
  "collectibles",
  "dragon",
  "guild",
];

/**
 * Chains that are not an LGS however many categories they match.
 *
 * A named list rather than a size heuristic: "do not automatically
 * exclude hybrid stores that are legitimate LGSs", and the honest way to
 * keep that promise is to exclude only businesses somebody wrote down.
 */
const MASS_RETAILERS = [
  "walmart",
  "target",
  "costco",
  "sam's club",
  "best buy",
  "gamestop",
  "barnes & noble",
  "barnes and noble",
  "cvs",
  "walgreens",
  "dollar general",
  "dollar tree",
  "five below",
  "toys r us",
  "meijer",
  "kroger",
];

/**
 * Adjacent, and usually not organised play.
 *
 * `arts_crafts_and_hobby_store` earns its place here from the data: 150
 * of them in one metro, nearly all craft shops. `cards_and_stationery_store`
 * is greeting cards. Neither is a reason to reject on its own - a shop can
 * be both - but neither is evidence on its own either.
 */
const WEAK_CATEGORIES = [
  "video_game_store",
  "video_and_video_game_rental",
  "game_publisher",
  "arcade",
  "casino",
  "toy_store",
  "toys_and_games_store",
  "arts_crafts_and_hobby_store",
  "cards_and_stationery_store",
  "sports_memorabilia_store",
  "antique_store",
  "pawn_shop",
];

const normalise = (value: string) => value.trim().toLowerCase();

/** Exact matches only. See the note on STRONG_CATEGORIES. */
const hits = (haystack: string[], needles: string[]) =>
  needles.filter((needle) => haystack.includes(needle));

export function scoreRelevance(candidate: {
  name: string;
  categories: string[];
  website: string | null;
  confidence: number | null;
  /**
   * The provider's own operating status, when it has one.
   *
   * A CORRECTION. The published Places field list does not mention this,
   * and the first cut of these rules said flatly that Overture has no
   * operating status and refused to print one. The release schema HAS
   * `operating_status`, so the honest thing is to repeat what the
   * provider said and attribute it - not to invent a status, and not to
   * pretend one is unavailable when it is right there.
   */
  operatingStatus?: string | null;
}): Relevance {
  const name = normalise(candidate.name);
  const categories = candidate.categories.map(normalise);
  const reasons: string[] = [];

  const retailer = MASS_RETAILERS.find((chain) => name.includes(chain));
  if (retailer) {
    return {
      verdict: "unlikely",
      reasons: [`Known mass retailer (${retailer})`],
    };
  }

  /*
   * Weak categories are decided FIRST, and a category that reads weak can
   * never also count as strong.
   *
   * Substring matching is what makes the rules survive a taxonomy change,
   * and it is also what let `video_game_store` match the strong pattern
   * `game_store` - so an arcade scored as a card shop. Classifying each
   * category once, weak first, is the fix: "video game" wins over "game
   * store" because it is the more specific description of the same word.
   */
  const weak = categories.filter((category) => WEAK_CATEGORIES.includes(category));
  const strongCategories = hits(
    categories.filter((category) => !weak.includes(category)),
    STRONG_CATEGORIES,
  );
  const nameWords = STRONG_NAME_WORDS.filter((word) =>
    new RegExp(`\\b${word}\\b`).test(name),
  );
  const weakCategories = hits(weak, WEAK_CATEGORIES);

  if (strongCategories.length > 0) {
    reasons.push(`Category: ${strongCategories.join(", ")}`);
  }
  if (nameWords.length > 0) {
    reasons.push(`Name mentions ${nameWords.join(", ")}`);
  }
  if (weakCategories.length > 0) {
    reasons.push(`Also categorised as ${weakCategories.join(", ")}`);
  }
  if (candidate.website) {
    reasons.push("Website on record");
  }
  /*
   * Both said as what they are: quoted from the provider, never dressed
   * up. `confidence` is a statement about the RECORD rather than about
   * the shop's front door, so it is labelled as the provider's.
   */
  if (candidate.operatingStatus) {
    reasons.push(`Provider says ${candidate.operatingStatus}`);
  }
  if (candidate.confidence !== null) {
    reasons.push(`Provider confidence ${candidate.confidence.toFixed(2)}`);
  }

  /* Two independent signals is the bar for a recommendation, because
     either one alone is a shop called "The Game" that sells trainers. */
  const strong = strongCategories.length > 0;
  const named = nameWords.length > 0;

  if (strong && named) return { verdict: "likely", reasons };
  if (strong || named) {
    if (weakCategories.length > 0 && !strong) {
      return { verdict: "possible", reasons };
    }
    return { verdict: "possible", reasons };
  }

  if (reasons.length === 0) reasons.push("Nothing in the record suggests a game store");
  return { verdict: "unlikely", reasons };
}
