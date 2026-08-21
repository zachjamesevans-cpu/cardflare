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
 * Matched as substrings against the provider's own category strings,
 * because taxonomies differ between providers and between releases and a
 * fixed enum would rot on the first schema change.
 */
const STRONG_CATEGORIES = [
  "hobby_shop",
  "hobby shop",
  "game_store",
  "game store",
  "gaming_store",
  "trading_card",
  "trading card",
  "collectible",
  "comic_book",
  "comic book",
  "board_game",
  "board game",
  "tabletop",
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

/** Categories that are adjacent but usually not organised play. */
const WEAK_CATEGORIES = [
  "video_game",
  "video game",
  "arcade",
  "casino",
  "toy_store",
  "toy store",
  "sports_memorabilia",
  "sports memorabilia",
  "antique",
  "pawn",
];

const normalise = (value: string) => value.trim().toLowerCase();

const hits = (haystack: string[], needles: string[]) =>
  needles.filter((needle) => haystack.some((item) => item.includes(needle)));

export function scoreRelevance(candidate: {
  name: string;
  categories: string[];
  website: string | null;
  confidence: number | null;
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
  const weak = categories.filter((category) =>
    WEAK_CATEGORIES.some((pattern) => category.includes(pattern)),
  );
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
   * Said as what it is. Overture publishes no operating status, so this
   * is a statement about the RECORD and printing it as "likely open"
   * would be inventing a fact the provider never claimed.
   */
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
