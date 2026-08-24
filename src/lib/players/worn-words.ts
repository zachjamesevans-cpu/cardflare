/**
 * The words a worn identity carries: what a title chip says, and the
 * mark on a badge.
 *
 * A pure module rather than lines inside `worn.tsx`, because the app
 * draws the same chips natively and has to say the same things - its
 * mirror is held to this file by a drift test, which can import a pure
 * module and cannot import a component.
 */

/**
 * What a title chip says.
 *
 * The seeded titles have wording of their own - "Your line here" is
 * not what `title-custom-tagline` would spell out - so the map wins
 * where it has an answer. Everything else reads its own slug, which is
 * built from the cosmetic's name in the first place.
 *
 * The fallback used to be the literal word "Title", which meant every
 * title dropped in through the console announced itself as "Title".
 * The founder hit exactly that with Founder.
 */
export const TITLE_WORDS: Record<string, string> = {
  "title-founder": "Founder",
  "title-custom-tagline": "Your line here",
  "title-trade-milestone": "Trade milestone",
  "title-collector": "Collector",
  "title-closer": "Closer",
  "title-regular": "Regular",
};

export function titleWords(slug: string): string {
  const known = TITLE_WORDS[slug];
  if (known) return known;

  return slug
    .replace(/^title-/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const BADGE_MARKS: Record<string, string> = {
  "badge-founder": "✦",
  "badge-beta-tester": "β",
  "badge-vendor": "⚑",
  "badge-lgs-staff": "♠",
  "badge-tournament-organizer": "♛",
  "badge-early-adopter": "☀",
  "badge-100-trades": "100",
  "badge-500-trades": "500",
  "badge-1000-trades": "1K",
};

/** The mark on a badge nobody wrote one for. */
export const BADGE_MARK_FALLBACK = "✦";
