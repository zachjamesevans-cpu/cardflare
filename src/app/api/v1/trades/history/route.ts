import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { ownProfile } from "@/lib/players/profile";
import { listTradeHistory } from "@/lib/trades/history";
import { deleteLoggedTrade, logTrade } from "@/lib/trades/logged";
import { logTradeSchema } from "@/lib/trades/logged-schema";

export const dynamic = "force-dynamic";

/**
 * The app's trade history: the same list the website's /profile/trades
 * reads, gated the same way. A free player gets the counts and
 * `locked: true` with no rows, so the phone has nothing to blur but
 * a stand-in.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const profile = await ownProfile(player.playerId);
  const history = await listTradeHistory(player.playerId, profile?.tier ?? null);

  return Response.json({ history });
}

/**
 * Logs a trade the player made by hand. The same schema the website's
 * form goes through; the row is theirs alone and earns no Embers.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = logTradeSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) {
    return badRequest(
      parsed.error.issues[0]?.message ?? "Check the trade and try again.",
    );
  }

  const profile = await ownProfile(player.playerId);
  const result = await logTrade(
    player.playerId,
    player.displayName,
    profile?.tier ?? null,
    parsed.data,
  );

  if (!result.ok) {
    const status =
      result.reason === "locked" ? 403 : result.reason === "no-card" ? 400 : 500;
    return Response.json({ ok: false, error: result.reason }, { status });
  }

  return Response.json({ ok: true, id: result.id });
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** Removes a logged trade. Only the author's own ever match. */
export async function DELETE(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = deleteSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("id is required");

  const ok = await deleteLoggedTrade(
    player.playerId,
    parsed.data.id,
    player.displayName,
  );
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
