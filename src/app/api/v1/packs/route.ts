import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { SERIES, oddsByRarity, oddsPerItem } from "@/lib/packs";
import { buyPackWithEmbers, listSealedPacks, openPack } from "@/lib/packs/repository";

export const dynamic = "force-dynamic";

/**
 * Packs, both directions: GET is the shop window (every series with
 * its odds, plus the caller's sealed packs), POST buys or opens.
 * Cookie or bearer alike, so the website and the app share one door.
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

  return Response.json({
    series: Object.values(SERIES).map((series) => ({
      id: series.id,
      name: series.name,
      setNumber: series.setNumber,
      priceEmbers: series.priceEmbers,
      slots: series.slots,
      odds: oddsByRarity(series),
      oddsDetail: oddsPerItem(series),
    })),
    packs: await listSealedPacks(me),
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("buy"), series: z.string().min(1).max(40) }),
  z.object({ action: z.literal("open"), packId: z.string().uuid() }),
]);

export async function POST(request: Request): Promise<Response> {
  const me = await viewerPlayerId(request);
  if (!me) return unauthorized();

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("Unrecognised pack action");

  if (parsed.data.action === "buy") {
    const outcome = await buyPackWithEmbers(me, parsed.data.series);
    if (outcome === "cannot-afford") {
      return Response.json({ error: "not-enough-embers" }, { status: 402 });
    }
    if (outcome === "failed") {
      return Response.json({ error: "buy-failed" }, { status: 500 });
    }
    return Response.json({ ok: true, packs: await listSealedPacks(me) });
  }

  const opened = await openPack(me, parsed.data.packId);
  if (!opened) return badRequest("That pack is not yours to open, or is already open.");

  return Response.json({
    series: opened.series.id,
    pulls: opened.pulls,
    packs: await listSealedPacks(me),
  });
}
