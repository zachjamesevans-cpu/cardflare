import { findStoreById } from "@/lib/events/repository";
import { idleInfo, NO_IDLE_INFO } from "@/lib/event-hub/idle-info";
import { findDisplayByToken } from "@/lib/event-hub/repository";
import { storeHasFeature } from "@/lib/stores/ultra-access";

export const dynamic = "force-dynamic";

/**
 * The idle screen's panels: the store's next nights, the cards wanted
 * there this week, its recent trades and its latest post.
 *
 * Its own route, fetched every five minutes, so the television's
 * thirty-second check (`../route.ts`) stays as light as it was. Same
 * rules as that route: GET only, the token names one display and can
 * do nothing else, and the same 404 for every kind of wrong token.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const display = await findDisplayByToken(token);
  if (!display) return Response.json({ error: "not-found" }, { status: 404 });
  if (!(await storeHasFeature(display.storeId, "flarecast"))) {
    return Response.json({ error: "ultra-required" }, { status: 402 });
  }

  const store = display.idleMode ? await findStoreById(display.storeId) : null;
  const info = store ? await idleInfo(store, display.idlePanels) : NO_IDLE_INFO;
  return Response.json(info, { headers: { "cache-control": "no-store" } });
}
