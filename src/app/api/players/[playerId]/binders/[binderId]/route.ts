import { absoluteImageUrls } from "@/lib/api/absolute";
import { readBinder } from "@/lib/binder/binder";
import { forOldBuild } from "@/app/api/v1/binders/_shared";
import { z } from "zod";
import { mayLook, viewerPlayerId } from "../../look";

export const dynamic = "force-dynamic";

/**
 * One of somebody's binders. Who may ask is the profile route's rule:
 * anybody standing in a room, never the open internet. A private one
 * is a 404 for everyone but its owner, and says "private".
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string; binderId: string }> },
): Promise<Response> {
  const { playerId, binderId } = await params;
  const id = z.guid().safeParse(binderId);
  if (!id.success) return Response.json({ error: "private" }, { status: 404 });
  const [allowed, me] = await Promise.all([mayLook(request), viewerPlayerId(request)]);
  if (!allowed) return Response.json({ error: "Join a room first." }, { status: 401 });
  const binder = await readBinder(playerId, me, id.data);
  if (!binder) return Response.json({ error: "private" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder: forOldBuild(binder) }));
}
