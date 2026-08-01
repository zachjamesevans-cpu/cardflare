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
 * How a printing reads to a player.
 *
 * Falls back through the fields the provider actually supplied rather than
 * inventing a label. Returns null when there is nothing meaningful to say,
 * so the UI can omit the chip instead of rendering an empty one.
 */
export function printingLabel(printing: CardPrinting): string | null {
  const parts = [
    printing.printingLabel ?? printing.setCode,
    printing.variantType,
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
