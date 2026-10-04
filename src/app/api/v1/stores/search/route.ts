import { LIMITS, tooMany } from "@/lib/api/throttle";
import { clientKey } from "@/lib/request-context";
import { searchStores } from "@/lib/stores/search";

export const dynamic = "force-dynamic";

/** The store half of the app's search: `GET /api/v1/stores/search?q=`. */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ stores: [] });

  const limited = tooMany(
    `store-search:${await clientKey()}`,
    LIMITS.search.limit,
    LIMITS.search.windowMs,
  );
  if (limited) return limited;

  return Response.json({ stores: await searchStores(query) });
}
