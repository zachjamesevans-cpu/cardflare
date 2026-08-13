import "server-only";

import type { Viewer } from "@/lib/auth/session";
import { playerForUser } from "./accounts";

/**
 * Who a signed-in viewer is as a player, if they are one at all.
 *
 * The founder is an admin who also holds a player account, and a store
 * owner might too, so this cannot key on the viewer kind alone — it has
 * to ask whether a `players` row exists. Three files were each doing
 * their own version of that; this is the one they should all be.
 *
 * Returns the name as well as the id, because everywhere that needs one
 * needs the other: joining a room, posting a Flare, and rendering a
 * roster all want "who is this, and what are they called".
 */
export interface AccountIdentity {
  playerId: string;
  displayName: string;
}

export async function accountIdentity(viewer: Viewer): Promise<AccountIdentity | null> {
  if (viewer.kind === "anonymous") return null;

  if (viewer.kind === "player") {
    return { playerId: viewer.playerId, displayName: viewer.playerName };
  }

  const player = await playerForUser(viewer.user.id);
  return player ? { playerId: player.id, displayName: player.display_name } : null;
}
