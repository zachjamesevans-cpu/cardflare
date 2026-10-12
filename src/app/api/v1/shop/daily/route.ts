import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { buyDailyOffer, dailyShelf } from "@/lib/players/daily-shop";

export const dynamic = "force-dynamic";

/**
 * The daily shop: GET is today's shelf, POST buys from it. Cookie or
 * bearer alike, so the website and the app share one door.
 */

async function viewerPlayerId(request: Request): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind !== "anonymous") {
    return (await playerForUser(viewer.user.id))?.id ?? null;
  }
  return (await apiPlayer(request))?.playerId ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const me = await viewerPlayerId(request);
  if (!me) return unauthorized();
  return Response.json(await dailyShelf(me));
}

const schema = z.object({ slug: z.string().min(1).max(80) });

const STATUS: Record<string, number> = {
  "not-today": 409,
  "not-pro": 403,
  locked: 403,
  "too-expensive": 402,
  failed: 500,
};

export async function POST(request: Request): Promise<Response> {
  const me = await viewerPlayerId(request);
  if (!me) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Which cosmetic?");

  const outcome = await buyDailyOffer(me, parsed.data.slug);
  if (outcome === "bought" || outcome === "owned") {
    return Response.json({ ok: true, outcome, shelf: await dailyShelf(me) });
  }
  return Response.json({ error: outcome }, { status: STATUS[outcome] ?? 400 });
}
