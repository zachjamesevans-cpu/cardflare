/**
 * Reading filters out of what somebody typed.
 *
 * The founder's ask, from a player: "luffy leader" should show Luffy
 * leaders, not every card whose name is a bit like "luffy leader". The
 * catalog already supports narrowing by type, colour and set — the
 * search function has taken those three arguments since the catalog was
 * built — and nothing was ever passing them.
 *
 * So this is a parser, not a new query language. Nobody at a counter is
 * going to type `type:leader`. They type the words they already say out
 * loud, and the words that happen to be card types, colours or set
 * codes get lifted out and used as filters. Everything else stays as
 * the name to match.
 *
 * Free of server-only imports so it can be unit-tested directly, the
 * same reason `src/lib/waitlist/form-data.ts` is.
 */

/**
 * A version word: "zoro manga" means show me the manga art, "zoro sp"
 * the SP. It never narrows WHICH cards come back — a Zoro without an SP
 * still appears, because hiding it answers a question nobody asked —
 * it steers which printing fronts each result and floats the cards
 * that have one to the top.
 */
export type VariantAsk = "alt" | "manga" | "sp" | "promo";

/** Narrowing pulled out of a typed query. Null means "not asked for". */
export interface CardQueryFilters {
  setCode: string | null;
  cardType: string | null;
  color: string | null;
  variant: VariantAsk | null;
}

export interface ParsedCardQuery {
  /** What is left to match against names, numbers and aliases. */
  text: string;
  filters: CardQueryFilters;
  /** Whether any word was taken as a filter. */
  narrowed: boolean;
}

/**
 * One Piece card types, as the catalog stores them: lowercased on
 * ingest in `src/lib/cards/domain.ts`.
 */
const CARD_TYPES = new Set(["leader", "character", "event", "stage", "don"]);

/** Also lowercased on ingest, in the provider adapter. */
const COLORS = new Set(["red", "green", "blue", "purple", "black", "yellow"]);

/**
 * A set code and nothing else: OP01, EB02, ST13, PRB01.
 *
 * Deliberately no dash. "OP01-024" is a card number and has to stay in
 * the text, where the compact-number match will find it exactly.
 */
const SET_CODE = /^[a-z]{2,3}\d{2}$/;

/**
 * The words players use for versions, mapped to one ask each. "Art"
 * after any of them is part of the phrase ("alt art", "manga art") and
 * gets swallowed with it.
 */
const VARIANT_WORDS: Record<string, VariantAsk> = {
  alt: "alt",
  alternate: "alt",
  parallel: "alt",
  manga: "manga",
  sp: "sp",
  promo: "promo",
  promos: "promo",
};

const EMPTY: CardQueryFilters = {
  setCode: null,
  cardType: null,
  color: null,
  variant: null,
};

export function parseCardQuery(raw: string): ParsedCardQuery {
  const words = raw.trim().split(/\s+/).filter(Boolean);

  /*
   * A single word is never a filter. Somebody typing "leader" wants
   * whatever the catalog makes of that word, and turning it into a
   * filter with nothing left to search for would return an empty
   * screen — worse than the imperfect list they get today.
   */
  if (words.length < 2) {
    return { text: raw.trim(), filters: { ...EMPTY }, narrowed: false };
  }

  const filters: CardQueryFilters = { ...EMPTY };
  const rest: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const key = word.toLowerCase();

    /*
     * First of each kind wins, and a second one stays in the text. Two
     * colours cannot both be applied — the catalog's search takes one —
     * and quietly dropping the second would answer a question nobody
     * asked.
     */
    if (filters.cardType === null && CARD_TYPES.has(key)) {
      filters.cardType = key;
      continue;
    }

    if (filters.color === null && COLORS.has(key)) {
      filters.color = key;
      continue;
    }

    if (filters.setCode === null && SET_CODE.test(key)) {
      filters.setCode = key.toUpperCase();
      continue;
    }

    if (filters.variant === null && key in VARIANT_WORDS) {
      filters.variant = VARIANT_WORDS[key];
      /* "alt art", "manga art": the second word is the same ask. */
      if (/^arts?$/i.test(words[index + 1] ?? "")) index += 1;
      continue;
    }

    rest.push(word);
  }

  const text = rest.join(" ");

  /*
   * Every word turned out to be a filter — "red leader", say. Same
   * reasoning as the single word above: the catalog's search needs
   * something to rank against, so this hands back exactly what was
   * typed and narrows nothing.
   */
  if (text === "") {
    return { text: raw.trim(), filters: { ...EMPTY }, narrowed: false };
  }

  const narrowed =
    filters.cardType !== null ||
    filters.color !== null ||
    filters.setCode !== null ||
    filters.variant !== null;

  return { text: narrowed ? text : raw.trim(), filters, narrowed };
}
