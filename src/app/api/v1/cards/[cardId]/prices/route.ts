import { z } from "zod";

import { cardPrices } from "@/lib/cards/prices";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { clientKey } from "@/lib/request-context";

/**
 * A card's market prices (src/lib/cards/prices.ts): public, like the
 * card page, and throttled like search. Not `force-dynamic`, so the
 * twelve-hour cache on the Scrydex request holds.
 */
type Params = { params: Promise<{ cardId: string }> };

const cardIdSchema = z.guid();

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const id = cardIdSchema.safeParse((await params).cardId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const limited = tooMany(
    `card-prices:${await clientKey()}`,
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  );
  if (limited) return limited;

  return Response.json({ prices: await cardPrices(id.data) });
}
