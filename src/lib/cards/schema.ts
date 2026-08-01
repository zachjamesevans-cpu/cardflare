import { z } from "zod";

import type { CardCategory } from "@/lib/supabase/types";

/**
 * Shortest query worth running.
 *
 * One character matches most of the pool and tells the player nothing, so the
 * form waits for two rather than rendering a wall of near-misses.
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
  setCode: string;
  rarity: string | null;
  variant: string | null;
  /** Null until a provider is licensed to supply artwork. */
  imageUrl: string | null;
}

export interface CardResult {
  id: string;
  code: string;
  name: string;
  category: CardCategory;
  colors: string[];
  types: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  life: number | null;
  attribute: string | null;
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
       * and are completely different problems — a typo versus a setup step
       * nobody has run. Carrying the distinction is what lets the page say
       * which one it is.
       */
      poolEmpty: boolean;
    };

export const CARD_SEARCH_IDLE: CardSearchState = { status: "idle" };

export const CATEGORY_LABELS: Record<CardCategory, string> = {
  leader: "Leader",
  character: "Character",
  event: "Event",
  stage: "Stage",
  don: "DON!!",
};

/**
 * How a printing reads to a player.
 *
 * A null variant is the base printing, which is the common case and does not
 * need saying. Naming it "Base" on every row would be noise.
 */
export function printingLabel(printing: CardPrinting): string {
  return [printing.setCode, printing.variant, printing.rarity]
    .filter(Boolean)
    .join(" · ");
}
