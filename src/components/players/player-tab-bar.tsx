import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { getPlayerSession } from "@/lib/players/session";
import { unreadCount } from "@/lib/notifications/inbox";
import { PlayerTabs } from "./player-tabs";

/**
 * Decides whether the website is wearing its app face.
 *
 * Shown to anyone who is actually playing — a signed-in player, or a
 * guest who has joined a room on this device — and to nobody else. A
 * marketing visitor reading the homepage gets no bottom bar, and a
 * store owner in the dashboard has their own navigation.
 *
 * The unread badge is resolved here rather than in the client bar so
 * the count arrives with the page instead of after it.
 */
export async function PlayerTabBar() {
  const viewer = await getViewer();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  // A guest mid-event has no account, but they are still playing.
  const guest = playerId ? null : await getPlayerSession();

  if (!playerId && !guest) return null;

  return <PlayerTabs unread={playerId ? await unreadCount(playerId) : 0} />;
}

/**
 * The room the bar occupies, so a page's last control is never trapped
 * under it. Paired with the bar on every page that renders one.
 */
export function TabBarSpacer() {
  return <div aria-hidden="true" className="h-20" />;
}
