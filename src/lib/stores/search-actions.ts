"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { clientKey } from "@/lib/request-context";
import { LIMITS } from "@/lib/api/throttle";
import { searchStores, type FoundStore } from "@/lib/stores/search";

/** The store half of the Feed's search, rate limited like the card search. */
export async function searchStoresAction(query: string): Promise<FoundStore[]> {
  if (typeof query !== "string" || query.trim().length < 2) return [];
  const allowed = checkRateLimit(
    `store-search:${await clientKey()}`,
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  ).allowed;
  if (!allowed) return [];
  return searchStores(query);
}
