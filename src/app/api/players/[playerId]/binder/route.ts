import { absoluteImageUrls } from "@/lib/api/absolute";
import { apiPlayer } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import { readBinder } from "@/lib/binder/binder";
import { playerForUser } from "@/lib/players/accounts";
import { getPlayerSession } from "@/lib/players/session";

export const dynamic = "force-dynamic";

/** The signed-in PLAYER behind a request, from cookie or bearer alike. */
async function viewerPlayerId(request: Request): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind !== "anonymous") {
    return (await playerForUser(viewer.user.id))?.id ?? null;
  }
  return (await apiPlayer(request))?.playerId ?? null;
}

/** Anybody standing in a room: an account, a guest seat, or a bearer. */
async function mayLook(request: Request): Promise<boolean> {
  const viewer = await getViewer();
  if (viewer.kind !== "anonymous") return true;
  const [session, api] = await Promise.all([getPlayerSession(), apiPlayer(request)]);
  return Boolean(session || api);
}

/**
 * Somebody's trade binder, as the app's Binder screen draws it.
 *
 * Who may ask is the same rule the profile route keeps: anybody
 * standing in a room, never the open internet. Whether it opens is the
 * owner's switch: a private binder is a 404 for everyone but its owner,
 * and says "private" so the screen can say so too.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
): Promise<Response> {
  const { playerId } = await params;
  const [allowed, me] = await Promise.all([mayLook(request), viewerPlayerId(request)]);
  if (!allowed) return Response.json({ error: "Join a room first." }, { status: 401 });
  const binder = await readBinder(playerId, me);
  if (!binder) return Response.json({ error: "private" }, { status: 404 });
  return Response.json(absoluteImageUrls({ binder }));
}
