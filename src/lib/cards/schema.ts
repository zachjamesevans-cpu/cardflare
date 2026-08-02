import { z } from "zod";

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
export function printingVariantMark(
  printing: CardPrinting,
  cardName: string,
): string | null {
  const name = printing.printingName?.trim();
  if (!name || name === cardName) return null;

  if (name.startsWith(cardName)) {
    const suffix = name.slice(cardName.length).trim();
    // Unwrap a single wrapping bracket: "(SPR)" reads better than "SPR" does
    // not — but "(Premium Card Collection -Best Selection Vol. 4-)" is worse
    // with the brackets than without.
    const unwrapped = suffix.replace(/^\(([\s\S]*)\)$/, "$1").trim();
    if (unwrapped) return unwrapped;
  }

  return name;
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
