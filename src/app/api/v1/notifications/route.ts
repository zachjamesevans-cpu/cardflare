import { z } from "zod";

import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { listInbox } from "@/lib/notifications/inbox";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The player's inbox — the same rows the notification backbone records
 * and email delivers, read back by the app. The website's own loader
 * builds the page, faces included, so the two inboxes are one list;
 * the only thing this route adds is absolute picture URLs, because a
 * phone has no origin to resolve `/api/avatars/...` against. Marking
 * read is scoped to the caller's own rows; there is nothing else here
 * to authorize because the query itself is keyed on the authenticated
 * player.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const notifications = await listInbox(player.playerId);

  return Response.json({ notifications: absoluteImageUrls(notifications) });
}

const readSchema = z.object({ ids: z.array(z.string()).min(1).max(100) });

/** Marks the given notifications read — the caller's own, only. */
export async function POST(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const parsed = readSchema.safeParse(await readJsonPayload(request));
  if (!parsed.success) return badRequest("ids are required");

  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
    .eq("player_id", player.playerId)
    .is("read_at", null);

  if (error) {
    console.error("Could not mark notifications read", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  return Response.json({ ok: true });
}
