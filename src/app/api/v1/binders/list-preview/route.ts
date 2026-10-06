import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { LIMITS, tooMany } from "@/lib/api/throttle";
import { parseDeckList } from "@/lib/players/deck-list";
import { previewDeckList } from "@/lib/players/deck-list-preview";

export const dynamic = "force-dynamic";

const schema = z.object({ list: z.string().min(1).max(20_000) });

/**
 * "Paste a list" for a binder, looked up before anything is added: one
 * entry per pasted line with its card, name and art, the unread lines
 * kept so the phone can show them. Writes nothing; the confirmed lines
 * go to POST /api/v1/binders/<id>/cards as a batch.
 */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const limited = tooMany(
    `deck-list:${player.playerId}`,
    LIMITS.deckList.limit,
    LIMITS.deckList.windowMs,
  );
  if (limited) return limited;

  const parsed = schema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("list is required");
  const { lines, unreadable } = parseDeckList(parsed.data.list);
  const entries = await previewDeckList(lines);
  return Response.json(absoluteImageUrls({ ok: true, entries, unreadable }));
}
