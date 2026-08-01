"use server";

import { text } from "@/lib/form-value";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { cardQuerySchema, type CardSearchState } from "./schema";
import { countCards, searchCards } from "./search";

/**
 * Search is unauthenticated and hits the database on every submission.
 *
 * Set for a person hunting several cards in a row at an event, not for a
 * script enumerating the card pool. Generous, because a whole store shares one
 * network — the same reasoning as joining.
 */
const SEARCH_MAX = 60;
const SEARCH_WINDOW_MS = 5 * 60 * 1000;

export async function searchCardsAction(
  _previous: CardSearchState,
  formData: FormData,
): Promise<CardSearchState> {
  const submitted = text(formData, "query");
  const parsed = cardQuerySchema.safeParse(submitted);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please enter a search.",
      query: submitted,
    };
  }

  const rate = checkRateLimit(
    `card-search:${await clientKey()}`,
    SEARCH_MAX,
    SEARCH_WINDOW_MS,
  );

  if (!rate.allowed) {
    return {
      status: "error",
      message: "Too many searches from this network. Please wait a moment.",
      query: submitted,
    };
  }

  const results = await searchCards(parsed.data);

  // Only asked when nothing matched, so the common path stays one query.
  const poolEmpty = results.length === 0 ? (await countCards()) === 0 : false;

  // An empty result set is a result, not an error: "no card matches that" is
  // the honest answer and the form says so rather than looking broken.
  return { status: "results", query: parsed.data, results, poolEmpty };
}
