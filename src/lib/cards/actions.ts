"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { parseCardQuery } from "./query";
import { cardQuerySchema, type CardResult } from "./schema";
import { countCards, searchCards, type CardSearchFilters } from "./search";

/**
 * Search is unauthenticated and hits the database on every call, and the UI
 * debounces rather than submits, so the ceiling is higher than a form's.
 *
 * Sized for a person hunting several cards in a row at an event, not for a
 * script enumerating the catalog. Generous because a whole store shares one
 * network — the same reasoning as joining a room.
 */
const SEARCH_MAX = 120;
const SEARCH_WINDOW_MS = 5 * 60 * 1000;

export type CardSearchResponse =
  | { status: "ok"; query: string; results: CardResult[]; poolEmpty: boolean }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

/**
 * Searches the local catalog.
 *
 * Called directly from the client on a debounce rather than through a form, so
 * it returns a plain response rather than form state. It never contacts the
 * provider — the runtime path is Supabase only.
 */
export async function searchCardsAction(
  rawQuery: string,
  filters: CardSearchFilters = {},
): Promise<CardSearchResponse> {
  const parsed = cardQuerySchema.safeParse(rawQuery);

  if (!parsed.success) {
    return {
      status: "invalid",
      message: parsed.error.issues[0]?.message ?? "Please enter a search.",
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
    };
  }

  /*
   * Words like "leader" or "red" become filters, and the rest stays as
   * the name to match. The catalog's search has taken these three
   * arguments since it was built; nothing was passing them.
   */
  const typed = parseCardQuery(parsed.data);

  try {
    /*
     * Filters are passed through as given. They are only ever compared against
     * columns inside a parameterised SQL function — never interpolated — so a
     * client-supplied value cannot widen the query beyond narrowing it.
     *
     * An explicit filter from the caller beats one read out of the text:
     * a UI control is a decision, a typed word is a guess.
     */
    let query = typed.text;
    let results = await searchCards(query, {
      setCode: filters.setCode ?? typed.filters.setCode,
      cardType: filters.cardType ?? typed.filters.cardType,
      color: filters.color ?? typed.filters.color,
    });

    /*
     * The guard that makes this safe to ship. Reading filters out of
     * prose is guesswork — a card whose name contains "black", a set
     * code the catalog spells differently — and a guess must never cost
     * somebody results they would have had. If narrowing found nothing,
     * the original query runs exactly as it did before.
     */
    if (results.length === 0 && typed.narrowed) {
      query = parsed.data;
      results = await searchCards(query, {
        setCode: filters.setCode ?? null,
        cardType: filters.cardType ?? null,
        color: filters.color ?? null,
      });
    }

    // Only asked when nothing matched, so the common path is still one query.
    const poolEmpty = results.length === 0 ? (await countCards()) === 0 : false;

    /* The query comes back as whatever actually ran, so the results
       highlight the words they were matched on. */
    return { status: "ok", query, results, poolEmpty };
  } catch (error) {
    // Logged, never returned: the message can carry database internals.
    console.error("Card search failed", error);
    return {
      status: "error",
      message: "Search is unavailable right now. Please try again in a moment.",
    };
  }
}
