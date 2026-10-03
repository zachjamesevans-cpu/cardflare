import { absoluteImageUrls } from "@/lib/api/absolute";
import { listBinders } from "@/lib/binder/binder";
import { forOldBuild } from "@/app/api/v1/binders/_shared";
import { mayLook, viewerPlayerId } from "../look";

export const dynamic = "force-dynamic";

/** Somebody's binders the viewer may open: the ones up for trade, or all of yours. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Response> {
  const { playerId } = await params;
  const [allowed, me] = await Promise.all([mayLook(request), viewerPlayerId(request)]);
  if (!allowed) return Response.json({ error: "Join a room first." }, { status: 401 });
  const binders = await listBinders(playerId, me);
  return Response.json(absoluteImageUrls({ binders: binders.map(forOldBuild) }));
}
