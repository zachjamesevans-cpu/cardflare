import "server-only";

import { apiPlayer } from "@/lib/api/auth";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { getPlayerSession } from "@/lib/players/session";

/** The signed-in PLAYER behind a request, from cookie or bearer alike. */
export async function viewerPlayerId(request: Request): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.kind === "player") return viewer.playerId;
  if (viewer.kind !== "anonymous") {
    return (await playerForUser(viewer.user.id))?.id ?? null;
  }
  return (await apiPlayer(request))?.playerId ?? null;
}

/** Anybody standing in a room: an account, a guest seat, or a bearer. */
export async function mayLook(request: Request): Promise<boolean> {
  const viewer = await getViewer();
  if (viewer.kind !== "anonymous") return true;
  const [session, api] = await Promise.all([getPlayerSession(), apiPlayer(request)]);
  return Boolean(session || api);
}
