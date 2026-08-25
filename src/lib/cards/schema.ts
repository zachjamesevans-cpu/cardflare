import { z } from "zod";

import type { VariantAsk } from "./query";

/**
 * Shortest query worth running. One character matches most of the pool and
 * tells the player nothing.
 */
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 60;

export const cardQuerySchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(MIN_QUERY_LENGTH, `Type at least ${MIN_QUERY_LENGTH} characters.`)
      .max(MAX_QUERY_LENGTH, "That search is too long."),
  );

export interface CardPrinting {
  /** Needed to name a specific printing on a Flare. */
  id: string;
  setCode: string | null;
  setName: string | null;
  printingLabel: string | null;
  /** The provider's own wording. Null when it did not classify the printing. */
  variantType: string | null;
  /** Rarity of this printing, which a base and an alternate art do not share. */
  rarity: string | null;
  /** The provider's name for this printing. Differs on a marked variant. */
  printingName: string | null;
  /** True only where the provider served it as a promo. Null means unknown. */
  isPromo: boolean | null;
  /** Provider-supplied only, and rendered only when the image flag is on. */
  imageUrl: string | null;
}

export interface CardResult {
  id: string;
  /** The provider's display name, verbatim. */
  exactName: string;
  canonicalCardNumber: string;
  cardType: string | null;
  colors: string[];
  traits: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  rarity: string | null;
  effectText: string | null;
  triggerText: string | null;
  printings: CardPrinting[];
}

export type CardSearchState =
  | { status: "idle" }
  | { status: "error"; message: string; query: string }
  | {
      status: "results";
      query: string;
      results: CardResult[];
      /**
       * True when no cards have been imported at all.
       *
       * "Nothing matched" and "nothing is loaded" look identical to a player
       * and are completely different problems — a typo versus a sync nobody
       * has run.
       */
      poolEmpty: boolean;
    };

export const CARD_SEARCH_IDLE: CardSearchState = { status: "idle" };

/**
 * What the provider called this printing, when that is not the card's name.
 *
 * The provider marks a variant by appending to the base name, so the useful
 * part is the suffix: "Kouzuki Oden (SPR)" against a card named "Kouzuki Oden"
 * yields "SPR". Falls back to the whole name when it is not a clean suffix,
 * because a truncated name is worse than a long one.
 */
/** "EB04-007", "OP01-024b": the shape of a printed number, not a word. */
const CARD_NUMBER_SHAPE = /^[a-z]{1,4}\d{2,}-\d+[a-z]*$/i;

export function printingVariantMark(
  printing: CardPrinting,
  cardName: string,
): string | null {
  const name = printing.printingName?.trim();
  if (!name || name === cardName) return null;

  if (!name.startsWith(cardName)) return name;

  const suffix = name.slice(cardName.length).trim();

  /*
   * The provider appends bracket groups to the base name, and not only
   * variant words: "Roronoa Zoro (EB04-007) (Alternate Art)" carries
   * the card number AND the variant. The old code unwrapped one
   * wrapping bracket, which across two groups produced the mangled
   * "EB04-007) (Alternate Art" the founder screenshotted — and left the
   * number in, where it made the base printing look like a variant. So:
   * every group is read on its own, groups that are just a card number
   * go (the chip already says the number), and what remains joins back
   * up. No groups left means no mark, which is what makes the base
   * printing recognisable as base.
   */
  const groups = [...suffix.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());
  const outside = suffix
    .replace(/\(([^()]*)\)/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const kept = [outside, ...groups].filter(
    (part) => part.length > 0 && !CARD_NUMBER_SHAPE.test(part),
  );

  return kept.length > 0 ? kept.join(" ") : null;
}

/**
 * How a printing reads to a player.
 *
 * Falls back through the fields the provider actually supplied rather than
 * inventing a label. Returns null when there is nothing meaningful to say,
 * so the UI can omit the chip instead of rendering an empty one.
 *
 * `cardName` is optional so callers that have no card in hand still get a
 * label; passing it is what lets a variant be told apart from its base
 * printing when the two share a set code and a rarity.
 */
export function printingLabel(
  printing: CardPrinting,
  cardName?: string,
): string | null {
  const parts = [
    printing.printingLabel ?? printing.setCode,
    /*
     * Rarity is what actually separates a base art from an alternate art.
     * Both carry the same card number and the same set code, so without it two
     * printings of OP12-034 render as the same string twice.
     */
    printing.rarity,
    printing.variantType,
    /*
     * A promo reprint carries the same card number and the same set id as the
     * booster printing, so without this both read as "OP09" and a player
     * cannot tell which one is in front of them — which is the whole question
     * when two people are trying to trade the right copy.
     */
    printing.isPromo ? "Promo" : null,
    /*
     * Last, and the only thing that separates some printings at all. EB01-001
     * has two printings that are both "EB-01 · L" — same set, same rarity —
     * and differ only in that one is named "Kouzuki Oden (SPR)".
     */
    cardName ? printingVariantMark(printing, cardName) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Splits text around a match so the UI can highlight it.
 *
 * Case-insensitive, and the needle is escaped — a query containing regex
 * metacharacters is a search term, not a pattern.
 */
export function highlightParts(
  haystack: string,
  needle: string,
): { text: string; match: boolean }[] {
  const term = needle.trim();
  if (term.length === 0) return [{ text: haystack, match: false }];

  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = haystack.split(new RegExp(`(${escaped})`, "ig"));

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: part.toLowerCase() === term.toLowerCase() }));
}

/* -------------------------------------------------------------------------- */
/* Choosing a representative printing                                         */
/* -------------------------------------------------------------------------- */

/**
 * Rarity ladder, plainest first.
 *
 * Only the codes that actually order a card against itself. `L` is not on it —
 * every printing of a Leader is `L`, so it separates nothing — and neither is
 * `PR`, which is handled by the promo flag instead. Anything unrecognised
 * sorts last rather than being guessed at.
 */
const RARITY_ORDER = ["c", "uc", "r", "sr", "sec"];

function rarityRank(rarity: string | null): number {
  const index = RARITY_ORDER.indexOf((rarity ?? "").trim().toLowerCase());
  return index === -1 ? RARITY_ORDER.length : index;
}

/**
 * Whether a printing is the version a typed variant word asks for.
 *
 * Reads every place a variant identifies itself — the classification's
 * `variantType`, the provider's rarity codes ("SP", "SP CARD"), the
 * name mark ("(Alternate Art)"), and an import's label — because the
 * same fact lives in a different field depending on where the printing
 * came from, and a player typing "zoro sp" does not care which.
 */
export function printingMatchesAsk(
  printing: CardPrinting,
  cardName: string,
  ask: VariantAsk,
): boolean {
  if (ask === "promo") return printing.isPromo === true;

  const said = [
    printing.variantType,
    printing.rarity,
    printing.printingLabel,
    printingVariantMark(printing, cardName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (ask === "sp") return /\bsp\b/.test(said);
  if (ask === "manga") return said.includes("manga");
  return /\b(alt|alternate|parallel)\b/.test(said);
}

/**
 * Results reordered so cards that HAVE the asked-for version lead.
 *
 * "Zoro sp" should read as a page of SPs — but a Zoro with no SP still
 * appears below them, because a version word is a preference, not a
 * gate, and an empty page teaches people the search is broken. The
 * sort is stable, so the ranking's order survives inside each half.
 */
export function floatAskedVariants(
  results: CardResult[],
  ask: VariantAsk | null,
): CardResult[] {
  if (!ask) return results;

  const has = (card: CardResult) =>
    card.printings.some((printing) =>
      printingMatchesAsk(printing, card.exactName, ask),
    );

  return [...results].sort((a, b) => Number(has(b)) - Number(has(a)));
}

/**
 * The printing to show when someone will take any version of a card.
 *
 * "Any printing" used to render no artwork at all, which is the one case where
 * a picture helps most — most people asking for any version have the ordinary
 * one in mind, and a nameless row is harder to spot in a binder than a picture.
 *
 * Order of preference:
 *
 * 1. **It has an image.** A perfectly chosen base printing with no artwork
 *    shows nothing, which is the problem being fixed. A picture of a different
 *    version of the right card beats no picture, and the row says "Any
 *    printing" beside it either way.
 * 2. **The version the query asked for**, when it asked: "zoro manga"
 *    should front the manga art of every Zoro that has one.
 * 3. **Not a promo.** A promo of a card is the least ordinary version of it.
 * 4. **Carrying no variant signal.** The provider marks a variant by
 *    appending to the base name and the console marks one in
 *    `variantType`; the printing with neither is the base one. This is
 *    the strongest signal available and the only one that works for
 *    Leaders, where every printing shares a rarity.
 * 5. **Plainest rarity**, then **earliest set code**, so the result is stable
 *    rather than dependent on row order.
 */
export function pickBasePrinting(
  printings: CardPrinting[],
  cardName: string,
  ask: VariantAsk | null = null,
): CardPrinting | null {
  if (printings.length === 0) return null;

  return [...printings].sort((a, b) => {
    const byImage = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
    if (byImage !== 0) return byImage;

    if (ask) {
      const byAsk =
        Number(printingMatchesAsk(b, cardName, ask)) -
        Number(printingMatchesAsk(a, cardName, ask));
      if (byAsk !== 0) return byAsk;
    }

    const byPromo = Number(a.isPromo === true) - Number(b.isPromo === true);
    if (byPromo !== 0) return byPromo;

    const marked = (printing: CardPrinting) =>
      Number(
        printing.variantType !== null ||
          printingVariantMark(printing, cardName) !== null,
      );
    const byMark = marked(a) - marked(b);
    if (byMark !== 0) return byMark;

    const byRarity = rarityRank(a.rarity) - rarityRank(b.rarity);
    if (byRarity !== 0) return byRarity;

    return (a.setCode ?? "").localeCompare(b.setCode ?? "");
  })[0]!;
}
