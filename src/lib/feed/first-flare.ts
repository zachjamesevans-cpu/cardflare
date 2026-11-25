/**
 * The Feed's first-Flare starter: the card a new player sees where
 * "Paste a deck list" used to be. The founder (2026-11-25): "pasting a
 * deck list is not that useful for someone new to the app and not the
 * first thing they'll probably want to do ... a bunch of cards with low
 * brightness on a carousel behind it that is slowly moving, and it's a
 * popular card from each TCG. it'll say 'post your first flare'."
 *
 * One famous card per game, Scrydex's art, alternating games so the
 * strip never shows two of one game side by side. The app keeps the same
 * list and words (mobile/src/first-flare.ts), held equal by
 * tests/unit/first-flare.test.ts.
 */
const ART = "https://images.scrydex.com";

export const FIRST_FLARE_CARDS = [
  { name: "Monkey.D.Luffy", imageUrl: `${ART}/onepiece/OP05-119/medium` },
  { name: "Charizard", imageUrl: `${ART}/pokemon/base1-4/medium` },
  { name: "Black Lotus", imageUrl: `${ART}/magicthegathering/LEA-232/medium` },
  { name: "Elsa", imageUrl: `${ART}/lorcana/TFC-207/medium` },
  { name: "Jinx, Rebel", imageUrl: `${ART}/riftbound/OGN-202/medium` },
  { name: "Gundam", imageUrl: `${ART}/gundam/GD01-001/medium` },
  { name: "Shanks", imageUrl: `${ART}/onepiece/OP01-120/medium` },
  { name: "Charizard ex", imageUrl: `${ART}/pokemon/sv3pt5-199/medium` },
] as const;

export const FIRST_FLARE = {
  headline: "Post your first Flare",
  body: "Name a card you're hunting. Players near you and at your store see it, and the ones who have it can offer.",
  label: "Post a Flare",
} as const;

/** One pass of the strip, in seconds: slow enough to read as calm. */
export const FIRST_FLARE_SECONDS = 40;
