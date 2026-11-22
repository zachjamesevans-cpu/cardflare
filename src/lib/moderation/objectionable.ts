/**
 * The filter in front of everything a player writes that somebody else
 * reads: names, handles, bios, binder names, comments, messages and the
 * notes on a Flare.
 *
 * Why it exists: App Store Guideline 1.2 asks an app with user content
 * for "a method for filtering objectionable material from being posted",
 * beside Report and Block, which cardflare already has. This is that
 * method, and it is deliberately narrow: slurs and explicit sexual
 * words, nothing a card game says. "Kill", "destroy", "trash", "attack"
 * and every card name stay sayable; a list that blocks trade talk would
 * be worse than none.
 *
 * Matching:
 * - Text is folded first: lowercase, accents stripped, look-alike
 *   digits and symbols read as letters (0→o, 1→i, 3→e, 4→a, 5→s, $→s,
 *   @→a), and a letter repeated three or more times read once.
 * - WORDS match as whole words only, so "spic" never catches "spicy".
 * - STEMS also match inside a longer run of letters, for handles and
 *   names written without spaces ("xx_<slur>_xx"); only terms long and
 *   distinctive enough never to sit inside an ordinary word are here.
 *
 * Kept in one file with no imports, so the server, the schemas and the
 * tests all read the same list.
 */

/* Whole words only. */
const WORDS = [
  // Slurs.
  "chink",
  "coon",
  "dyke",
  "fag",
  "fags",
  "gook",
  "kike",
  "kikes",
  "spic",
  "spics",
  "tranny",
  "trannies",
  "wetback",
  "wetbacks",
  "retard",
  "retards",
  // Explicit sexual words.
  "cock",
  "cocks",
  "cunt",
  "cunts",
  "pussy",
  "pussies",
  "porn",
  "porno",
  "rape",
  "raped",
  "rapist",
  "whore",
  "whores",
  "slut",
  "sluts",
  "cum",
  "jizz",
  "blowjob",
  "handjob",
  "nudes",
];

/* Also inside a longer word: long and unmistakable. */
const STEMS = [
  "nigger",
  "nigga",
  "faggot",
  "retarded",
  "pedophile",
  "paedophile",
  "childporn",
  "blowjob",
  "handjob",
  "motherfucker",
  "cocksucker",
  "kkk",
  "heilhitler",
  "siegheil",
];

const LOOKALIKE: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  $: "s",
  "@": "a",
  "!": "i",
  "|": "i",
};

/** Lowercase, no accents, look-alikes read as letters, long runs read once. */
export function foldForFilter(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[013457$@!|]/g, (character) => LOOKALIKE[character] ?? character)
    .replace(/([a-z])\1{2,}/g, "$1");
}

const WORD_SET = new Set(WORDS);

/** True when the text has a slur or an explicit sexual word in it. */
export function isObjectionable(text: string | null | undefined): boolean {
  if (!text) return false;
  const folded = foldForFilter(text);
  for (const word of folded.split(/[^a-z]+/)) {
    if (word && WORD_SET.has(word)) return true;
  }
  /* Letters only, so separators can't hide a stem: "n_i_g..." */
  const letters = folded.replace(/[^a-z]/g, "");
  return STEMS.some((stem) => letters.includes(stem));
}

/** What a refused write says, everywhere. */
export const OBJECTIONABLE_MESSAGE =
  "That has words cardflare doesn't allow. Please change it.";
