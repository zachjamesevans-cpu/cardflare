"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
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

  try {
    /*
     * Filters are passed through as given. They are only ever compared against
     * columns inside a parameterised SQL function — never interpolated — so a
     * client-supplied value cannot widen the query beyond narrowing it.
     */
    const results = await searchCards(parsed.data, {
      setCode: filters.setCode ?? null,
      cardType: filters.cardType ?? null,
      color: filters.color ?? null,
    });

    // Only asked when nothing matched, so the common path is still one query.
    const poolEmpty = results.length === 0 ? (await countCards()) === 0 : false;

    return { status: "ok", query: parsed.data, results, poolEmpty };
  } catch (error) {
    // Logged, never returned: the message can carry database internals.
    console.error("Card search failed", error);
    return {
      status: "error",
      message: "Search is unavailable right now. Please try again in a moment.",
    };
  }
}
