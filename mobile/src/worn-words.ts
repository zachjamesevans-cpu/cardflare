/**
 * The words a worn identity carries - the app's copy.
 *
 * MIRRORS src/lib/players/worn-words.ts, which stays the source of
 * truth; tests/unit/worn-words-drift.test.ts holds the two together.
 * A badge that says ♛ on the website and ✦ in the app is two different
 * honours with one name, which is why this cannot drift.
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

export const BADGE_MARK_FALLBACK = "✦";
