import { z } from "zod";

import { LIMITS, tooMany } from "@/lib/api/throttle";
import { cardResultById } from "@/lib/cards/search";
import { clientKey } from "@/lib/request-context";

/**
 * One card's catalogue record, the shape a search result has: public,
 * like the card page, and throttled like search. The website's + on a
 * card puts it in your Flare's draft without leaving the page (the
 * founder, 2026-11-25: "similar function to how when you add something
 * to cart"), and a draft line needs the whole card.
 */
type Params = { params: Promise<{ cardId: string }> };

const cardIdSchema = z.guid();

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const id = cardIdSchema.safeParse((await params).cardId);
  if (!id.success) return Response.json({ error: "not-found" }, { status: 404 });

  const limited = tooMany(
    `card-result:${await clientKey()}`,
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  );
  if (limited) return limited;

  const card = await cardResultById(id.data);
  if (!card) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json(
    { card },
    {
      headers: {
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
