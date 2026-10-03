import { absoluteImageUrls } from "@/lib/api/absolute";
import { firstTradeBinderId, readBinder } from "@/lib/binder/binder";
import { forOldBuild } from "@/app/api/v1/binders/_shared";
import { mayLook, viewerPlayerId } from "../look";

export const dynamic = "force-dynamic";

/** For the app build that still asks for somebody's "trade binder": their first one up for trade. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Response> {
  const { playerId } = await params;
  const [allowed, me] = await Promise.all([mayLook(request), viewerPlayerId(request)]);
  if (!allowed) return Response.json({ error: "Join a room first." }, { status: 401 });
  const id = await firstTradeBinderId(playerId);
  const binder = id ? await readBinder(playerId, me, id) : null;
  if (!binder) return Response.json({ error: "private" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder: forOldBuild(binder) }));
}
