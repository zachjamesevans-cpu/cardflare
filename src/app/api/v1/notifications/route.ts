import { z } from "zod";

import { apiPlayer, badRequest, unauthorized } from "@/lib/api/auth";
import { readJsonPayload } from "@/lib/api/payload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * The player's inbox — the same rows the notification backbone records
 * and email delivers, read back by the app. Marking read is scoped to the
 * caller's own rows; there is nothing else here to authorize because the
 * query itself is keyed on the authenticated player.
 */
export async function GET(request: Request): Promise<Response> {
  const player = await apiPlayer(request);
  if (!player) return unauthorized();

  const { data, error } = await getSupabaseAdmin()
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at")
    .eq("player_id", player.playerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Could not list notifications", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  return Response.json({
    notifications: (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      url: row.url,
      createdAt: row.created_at,
      readAt: row.read_at,
    })),
  });
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
