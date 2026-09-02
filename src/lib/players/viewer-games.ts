import "server-only";

import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import type { GameSlug } from "@/lib/players/games-catalog";

/**
 * The games the person looking at this page said they play, for
 * defaulting a card search to one of them. Empty for a guest, and
 * empty when the answer cannot be read: a search that defaults to
 * "every game" is the honest fallback, never an error.
 */
export async function viewerGames(): Promise<GameSlug[]> {
  try {
    const viewer = await getViewer();
    if (viewer.kind === "anonymous") return [];

    const playerId =
      viewer.kind === "player"
        ? viewer.playerId
        : ((await playerForUser(viewer.user.id))?.id ?? null);
    if (!playerId) return [];

    return await listPlayerGames(playerId);
  } catch (error) {
    console.error("Could not read the viewer's games", error);
    return [];
  }
}
