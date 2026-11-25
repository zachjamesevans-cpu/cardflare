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

  const prices = await cardPrices(id.data);
  return Response.json(
    { prices },
    {
      /* The edge keeps an answer for the same twelve hours the server's
         Scrydex cache does, so a card anyone has opened answers from the
         nearest edge at once. A failed read is not kept. */
      headers:
        prices.state === "unavailable"
          ? { "cache-control": "no-store" }
          : prices.state === "none"
            ? /* "No price" is kept an hour, not twelve: it can be wrong. */
              { "cache-control": "public, s-maxage=3600" }
            : {
                "cache-control": "public, s-maxage=43200, stale-while-revalidate=86400",
              },
    },
  );
}
